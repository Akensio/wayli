/** A hook's default: nobody filled it (controllers/install.ts), which is a bug to see, not a silence. */
export function unset(name: string): never {
  throw new Error(`hook ${name} was not installed`);
}
