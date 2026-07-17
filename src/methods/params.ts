/**
 * Build the positional tail of an RPC param list.
 *
 * verusd params are positional, so a caller who sets only a later option
 * forces every earlier slot onto the wire. Slots up to the last set option
 * are filled from `defaults`; nothing is sent past it (the daemon then
 * applies its own default for the omitted tail).
 *
 * `defaults` is the daemon's documented default for each slot and is spelled
 * out per call site on purpose — those values are daemon facts, several of
 * them hard-won (a skipped height slot must be `null`, not `0`, or the
 * daemon answers with the genesis state), and they belong next to the method
 * they govern rather than inside this helper.
 */
export function positionalTail(opts: readonly unknown[], defaults: readonly unknown[]): unknown[] {
  if (defaults.length !== opts.length) {
    // A short defaults array would push `undefined` into a params slot, which
    // serializes as null — on a method carrying a feeOffer, silently not the
    // intended default. Fail at the call site instead.
    throw new TypeError(`positionalTail: ${opts.length} options but ${defaults.length} defaults`);
  }
  const lastSet = opts.reduce<number>((last, value, i) => (value === undefined ? last : i), -1);
  const tail: unknown[] = [];
  for (let i = 0; i <= lastSet; i++) tail.push(opts[i] ?? defaults[i]);
  return tail;
}
