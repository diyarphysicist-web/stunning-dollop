import { IntlMessageFormat, type PrimitiveType } from "intl-messageformat";
import { en, type MessageId } from "./messages.en.js";

const LOCALE = "en-US";
const compiled = new Map<MessageId, IntlMessageFormat>();

/** Formats a catalog message (GEN-200). Numbers in `{x, number}` arguments follow GEN-201. */
export function t(id: MessageId, values?: Record<string, PrimitiveType>): string {
  let m = compiled.get(id);
  if (!m) {
    m = new IntlMessageFormat(en[id], LOCALE);
    compiled.set(id, m);
  }
  const out = m.format(values);
  if (typeof out !== "string") throw new TypeError(`Message ${id} produced rich content; use a string-only message.`);
  return out;
}

export function messageIds(): MessageId[] {
  return Object.keys(en) as MessageId[];
}
