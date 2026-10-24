// What the kart pad sends -> what the race needs.
// DRIFT and ITEM keep the kart accelerating (your thumb has moved off GAS to press them);
// BRAKE always wins over gas.
//   held: { steer, gas, brake, drift, item, tapped } -> { steer, gas, brake, drift, tapped }
//   (tapped = DRIFT was pressed since the last step, even if already let go: a quick tap counts)
export function kartInput(held) {
  return {
    steer: held.steer || 0,
    gas: !!(held.gas || held.drift || held.item) && !held.brake,
    brake: !!held.brake,
    drift: !!held.drift,
    tapped: !!held.tapped,
  };
}
