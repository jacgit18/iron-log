// The admin accounts list shows an address only as a mask: the first letter, three stars and the domain (`j***@gmail.com`). Pure, so the
// server and its test share it. Anything that is not an address becomes `account`; a development user (`dev:name`) is handled by the caller.
export function maskEmail(email: string | null | undefined): string {
  const at = typeof email === 'string' ? email.lastIndexOf('@') : -1;
  if (!email || at < 1 || at === email.length - 1) return 'account';
  const first = [...email.slice(0, at)][0]!;
  return `${first}***${email.slice(at)}`;
}
