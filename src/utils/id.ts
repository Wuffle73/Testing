/**
 * RFC4122-ish v4 UUID generator.
 *
 * React Native's Hermes engine does not expose `crypto.randomUUID`, and we
 * avoid pulling in a native crypto module just for local row IDs. Math.random
 * is more than sufficient for client-side primary keys in an offline app.
 */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
