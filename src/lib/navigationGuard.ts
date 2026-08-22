type GuardFn = (proceed: () => void) => void;

let activeGuard: GuardFn | null = null;

export function registerGuard(fn: GuardFn) {
  activeGuard = fn;
}

export function unregisterGuard() {
  activeGuard = null;
}

export function runGuarded(proceed: () => void) {
  if (activeGuard) {
    activeGuard(proceed);
  } else {
    proceed();
  }
}
