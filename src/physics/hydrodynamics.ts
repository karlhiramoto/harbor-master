import { VesselSpec } from './vessels';

export const KNOTS_TO_MS = 0.514444;
export const MS_TO_KNOTS = 1 / KNOTS_TO_MS;
export const AIR_DENSITY_RHO = 1.225;

export interface ControlInputs {
  /** -1.0 (full astern) .. 0 (neutral) .. +1.0 (full ahead) */
  throttle: number;
  /** -1.0 (full port / left) .. 0 (center) .. +1.0 (full starboard / right) */
  helm: number;
  /** -1.0 (push bow port) .. 0 .. +1.0 (push bow starboard) */
  bowThruster: number;
}

export interface WindEnvironment {
  /** Base true wind speed in knots (0..25) */
  trueWindKnots: number;
  /** Direction wind is BLOWING FROM in nautical compass degrees (0=N, 90=E, 180=S, 270=W) */
  windFromDeg: number;
  /** Dynamic gust multiplier (e.g. 0.85..1.25) */
  gustFactor: number;
  /** Leeward yacht shelter multiplier (1.0 = exposed open water, 0.35 = behind mega-yacht) */
  shelterFactor: number;
}

export interface BodyVelocityState {
  /** Forward surge velocity in m/s (+ ahead, - astern) */
  u: number;
  /** Lateral sway velocity in m/s (+ starboard, - port) */
  v: number;
  /** Yaw angular velocity in rad/s (+ clockwise / turning starboard, - turning port) */
  r: number;
}

export interface HydroStepResult {
  /** Body-fixed surge force X (N) */
  forceBodyX: number;
  /** Body-fixed lateral force Y (N, + starboard, - port) */
  forceBodyY: number;
  /** Yaw torque N (N*m, + clockwise/starboard turn) */
  torqueZ: number;
  /** Linear accelerations [du/dt, dv/dt, dr/dt] after added-mass inversion */
  duDt: number;
  dvDt: number;
  drDt: number;
  /** Telemetry for HUD & Live Hydrodynamic Force X-Ray Overlay */
  telemetry: HydroTelemetry;
}

export interface HydroTelemetry {
  surgeKnots: number;
  swayKnots: number;
  speedKnots: number;
  yawRateRadSec: number;
  helmAngleDeg: number;
  /** Dynamic hull pivot point forward of midships (m) */
  pivotPointLocalX: number;
  /** Prop thrust / wash vector in body frame (N) */
  propThrustBody: { x: number; y: number; torque: number };
  /** Lateral prop walk force at stern (N, negative = port stern pull) */
  propWalkLateralN: number;
  /** Effective bow thruster lateral force (N) */
  bowThrusterLateralN: number;
  /** Net aerodynamic force in body frame (N) + yaw moment */
  windForceBody: { x: number; y: number; torque: number; effectiveKnots: number };
  /** Visual roll heel angle (degrees) */
  heelAngleDeg: number;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function clampWindKnots(knots: number): number {
  if (!Number.isFinite(knots)) return 0;
  return clamp(knots, 0, 25);
}

export function normalizeCompassDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

export function normalizeAngleRad(rad: number): number {
  if (!Number.isFinite(rad)) return 0;
  return (((rad + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

/**
 * Converts nautical compass "wind FROM" degrees (0=North/top, 90=East/right, 180=South/bottom, 270=West/left)
 * into a 2D world velocity vector [wx, wy] (where +X = East/Right, +Y = South/Down) pointing where wind BLOWS TO.
 */
export function windFromDegToWorldVelocity(windFromDeg: number, speedKnots: number): { wx: number; wy: number } {
  const speedMs = clampWindKnots(speedKnots) * KNOTS_TO_MS;
  const fromRad = (normalizeCompassDeg(windFromDeg) * Math.PI) / 180;
  // Wind FROM North (0 deg) blows South (wx=0, wy=+speedMs)
  // Wind FROM East (90 deg) blows West (wx=-speedMs, wy=0)
  return {
    wx: -Math.sin(fromRad) * speedMs,
    wy: Math.cos(fromRad) * speedMs,
  };
}

/**
 * Computes 3-DOF Fossen marine forces, moments, and added-mass accelerations in body-fixed coordinates:
 *  +x_b = Bow (ahead), +y_b = Starboard (right), +psi/+r = Clockwise yaw (turn to Starboard).
 */
export function computeHydrodynamicStep(
  spec: VesselSpec,
  headingRad: number,
  vel: BodyVelocityState,
  controls: ControlInputs,
  wind: WindEnvironment
): HydroStepResult {
  const throttle = clamp(controls.throttle, -1, 1);
  const helm = clamp(controls.helm, -1, 1);
  const bowThrusterInput = spec.hasBowThruster ? clamp(controls.bowThruster, -1, 1) : 0;

  const { u, v, r } = vel;
  const helmRad = (helm * spec.maxHelmDeg * Math.PI) / 180;
  const speedMs = Math.hypot(u, v);
  const speedKnots = speedMs * MS_TO_KNOTS;

  // 1. Dynamic Hull Pivot Point (shifts forward under headway, aft under sternway)
  const forwardBlend = clamp(u / 1.4, -1, 1);
  const pivotPointLocalX =
    forwardBlend >= 0
      ? forwardBlend * spec.forwardPivotBiasM
      : Math.abs(forwardBlend) * spec.reversePivotBiasM;

  // 2. Propulsion, Steerable Outboard vs. Fixed Inboard + Spade Rudder + Prop Walk
  let propX = 0;
  let propY = 0;
  let propTorque = 0;
  let propWalkLat = 0;

  if (spec.propulsion === 'outboard') {
    // Vectored outboard nozzle at transom (x = spec.propPosX, negative):
    // In forward throttle (+), positive helm (+ right turn) deflects thrust to -y (port),
    // which at x = -3.5m produces POSITIVE torque (+N = clockwise right turn of bow, swinging stern port)!
    // In reverse throttle (-), positive helm pulls stern to +y (starboard), backing stern to starboard!
    const rawThrust =
      throttle >= 0 ? throttle * spec.maxForwardThrustN : throttle * spec.maxReverseThrustN;

    if (throttle >= 0) {
      propX = rawThrust * Math.cos(helmRad);
      propY = -rawThrust * Math.sin(helmRad);
    } else {
      // In reverse, outboard pulls transom toward helm direction
      propX = rawThrust * Math.cos(helmRad);
      propY = -rawThrust * Math.sin(helmRad) * 0.85;
    }

    // Minimal skeg/lower-unit hydrodynamic lift when coasting in Neutral
    const lowerUnitLiftN = -u * Math.abs(u) * 95 * Math.sin(helmRad);
    propY += lowerUnitLiftN;

    // Slight prop walk at transom
    propWalkLat =
      throttle < 0
        ? Math.abs(throttle) * -spec.reversePropWalkPortN
        : throttle * spec.forwardPropWalkStbdN;
    propY += propWalkLat;

    // Yaw moment about CoG (moment arm = spec.propPosX, which is negative!)
    propTorque = spec.propPosX * propY;
  } else {
    // 12m Auxiliary Sailboat: Fixed Inboard Shaft + Deep Spade Rudder + Right-Hand Prop Walk
    const rawThrust =
      throttle >= 0 ? throttle * spec.maxForwardThrustN : throttle * spec.maxReverseThrustN;
    propX = rawThrust;

    // Right-handed prop walk: in Reverse, paddlewheel effect strongly pulls stern to PORT (-Y),
    // which applies POSITIVE clockwise torque (bow swings to Starboard, stern walks to Port)!
    // Prop walk is strongest before fast sternway develops and softens slightly once moving fast astern.
    const sternwayAtten = throttle < 0 ? 1 / (1 + Math.max(0, -u) * 0.25) : 1;
    propWalkLat =
      throttle < 0
        ? Math.abs(throttle) * -spec.reversePropWalkPortN * sternwayAtten
        : throttle * spec.forwardPropWalkStbdN;

    // Flow over the spade rudder:
    // - Forward motion (+u) flows aft across rudder
    // - Forward throttle (+throttle) blasts prop wash directly across rudder EVEN AT u = 0 kn!
    // - Reverse throttle (-throttle) sucks water forward AWAY from rudder, so ONLY actual sternway (-u) steers in reverse!
    const forwardPropWashFlowMs =
      throttle > 0 ? Math.sqrt((throttle * spec.maxForwardThrustN * spec.propWashRudderCoupling) / 520) : 0;

    let rudderLateralForceN = 0;
    if (u >= -0.05 || forwardPropWashFlowMs > Math.abs(u)) {
      const effectiveAftFlowMs = Math.max(0, u + forwardPropWashFlowMs);
      // Rudder angled right (+helmRad) deflects water to Port (-Y) -> stern pushes Port (-Y), bow turns Right (+r)
      rudderLateralForceN = -effectiveAftFlowMs * effectiveAftFlowMs * 640 * Math.sin(helmRad);
    } else {
      // Moving astern (u < -0.05): reverse flow across rudder requires real sternway (~0.8+ kn) to gain authority
      const sternwayMs = Math.abs(u);
      const lowSpeedDeadband = clamp((sternwayMs - 0.18) / 0.45, 0, 1);
      // Backing with wheel right (+helmRad) swings stern to Starboard (+Y -> -r torque)
      rudderLateralForceN = sternwayMs * sternwayMs * 510 * lowSpeedDeadband * Math.sin(helmRad);
    }

    propY = rudderLateralForceN + propWalkLat;
    propTorque = spec.propPosX * propY;
  }

  // 3. Proportional Tunnel Bow Thruster (with realistic forward/aft cross-flow velocity loss)
  const crossflowRatio = speedKnots / Math.max(1, spec.thrusterCrossflowHalfKnots);
  const thrusterEfficiency = 1 / (1 + crossflowRatio * crossflowRatio);
  const bowThrusterLateralN = bowThrusterInput * spec.bowThrusterMaxN * thrusterEfficiency;
  const bowThrusterTorque = spec.bowThrusterPosX * bowThrusterLateralN;

  // 4. Aerodynamic Apparent Wind & Leeward Shelter
  const effectiveWindKnots =
    clampWindKnots(wind.trueWindKnots) *
    clamp(wind.gustFactor, 0.5, 1.5) *
    clamp(wind.shelterFactor, 0.2, 1.0);
  const { wx, wy } = windFromDegToWorldVelocity(wind.windFromDeg, effectiveWindKnots);

  // Transform world wind into body-fixed frame (+x_b forward, +y_b starboard)
  const cosH = Math.cos(headingRad);
  const sinH = Math.sin(headingRad);
  const windBodyX = wx * cosH + wy * sinH;
  const windBodyY = -wx * sinH + wy * cosH;

  const appWindX = windBodyX - u;
  const appWindY = windBodyY - v;

  const windForceX = 0.5 * AIR_DENSITY_RHO * spec.frontalWindAreaM2 * appWindX * Math.abs(appWindX);
  const windForceY = 0.5 * AIR_DENSITY_RHO * spec.lateralWindAreaM2 * appWindY * Math.abs(appWindY);
  // Higher freeboard forward causes bow to blow off crosswinds naturally
  const windTorque = spec.windCenterOffsetX * windForceY;

  // 5. Hydrodynamic Hull & Fin Keel Drag (with forward-shifted dynamic pivot coupling)
  const dragX = -(spec.surgeDragLinear * u + spec.surgeDragQuad * u * Math.abs(u));
  // Local lateral velocity at underwater center of lateral resistance (pivotPointLocalX)
  const vAtClr = v + pivotPointLocalX * r * 0.42;
  const dragY = -(spec.swayDragLinear * vAtClr + spec.swayDragQuad * vAtClr * Math.abs(vAtClr));
  const dragTorque =
    -(spec.yawDragLinear * r + spec.yawDragQuad * r * Math.abs(r)) +
    pivotPointLocalX * dragY * 0.36;

  // 6. Coriolis / Added-Mass Munk Coupling Moment (subtle hull weather-helm / turn coupling)
  const coriolisX = (spec.massKg + spec.addedMassSwayKg) * v * r * 0.28;
  const coriolisY = -(spec.massKg + spec.addedMassSurgeKg) * u * r * 0.35;

  const forceBodyX = propX + windForceX + dragX + coriolisX;
  const forceBodyY = propY + bowThrusterLateralN + windForceY + dragY + coriolisY;
  const torqueZ = propTorque + bowThrusterTorque + windTorque + dragTorque;

  const mTotalX = spec.massKg + spec.addedMassSurgeKg;
  const mTotalY = spec.massKg + spec.addedMassSwayKg;

  const duDt = forceBodyX / mTotalX;
  const dvDt = forceBodyY / mTotalY;
  const drDt = torqueZ / spec.yawInertiaKgM2;

  // Visual roll heel angle (in degrees): wind on starboard pushes port heel, hard turn heels hull
  const netLateralKN = (windForceY + propY * 0.45) / 1000;
  const heelAngleDeg = clamp(netLateralKN * spec.heelComplianceDegPerKN, -18, 18);

  return {
    forceBodyX,
    forceBodyY,
    torqueZ,
    duDt,
    dvDt,
    drDt,
    telemetry: {
      surgeKnots: u * MS_TO_KNOTS,
      swayKnots: v * MS_TO_KNOTS,
      speedKnots,
      yawRateRadSec: r,
      helmAngleDeg: helm * spec.maxHelmDeg,
      pivotPointLocalX,
      propThrustBody: { x: propX, y: propY - propWalkLat, torque: propTorque },
      propWalkLateralN: propWalkLat,
      bowThrusterLateralN,
      windForceBody: {
        x: windForceX,
        y: windForceY,
        torque: windTorque,
        effectiveKnots: effectiveWindKnots,
      },
      heelAngleDeg,
    },
  };
}
