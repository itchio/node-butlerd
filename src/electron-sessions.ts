let registeredSessions = [];
let onRegister: RegisterCallback = null;
export type RegisterCallback = (session: any) => void;

/**
 * Registers an electron session for which we should set
 * the certificate verify proc.
 */
export function registerElectronSession(session: any) {
  registeredSessions.push(session);
  onRegister(session);
}

export function onRegisterElectronSession(cb: RegisterCallback) {
  onRegister = cb;
}

export function getRegisteredElectronSessions() {
  return registeredSessions;
}
