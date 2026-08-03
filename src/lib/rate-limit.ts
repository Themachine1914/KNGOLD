/**
 * Limitador de intentos en memoria.
 *
 * Sirve para frenar el fuerza bruta contra el login y el gasto de CPU de
 * bcrypt. Al vivir en memoria no se comparte entre instancias ni sobrevive
 * a un reinicio: en un despliegue con varias instancias hay que moverlo a
 * la base de datos o a Redis. Para un negocio con un puñado de usuarios en
 * una sola instancia, alcanza.
 */

type Attempt = { count: number; firstAt: number; blockedUntil?: number };

const attempts = new Map<string, Attempt>();

/**
 * La clave lleva correo Y dirección. Con solo el correo, cualquiera que
 * conozca `dueno@kngold.com.do` lo deja fuera de su propia app mandando
 * cinco intentos fallidos cada quince minutos.
 */
export function attemptKey(email: string, ip: string | null): string {
  return `${email}|${ip ?? "sin-ip"}`;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BLOCK_MS = 15 * 60 * 1000;
/** Tope de claves para que un atacante no nos haga crecer el mapa sin fin. */
const MAX_KEYS = 5000;

function sweep(now: number) {
  for (const [key, a] of attempts) {
    const expired = now - a.firstAt > WINDOW_MS;
    const unblocked = !a.blockedUntil || a.blockedUntil <= now;
    if (expired && unblocked) attempts.delete(key);
  }
  // Si siguen todas vivas (un ataque con muchas claves a la vez), se poda por
  // antigüedad. Sin esto el mapa crecía por encima del tope.
  if (attempts.size > MAX_KEYS) {
    const porEdad = [...attempts.entries()].sort((a, b) => a[1].firstAt - b[1].firstAt);
    for (const [key] of porEdad.slice(0, attempts.size - MAX_KEYS)) {
      attempts.delete(key);
    }
  }
}

/** ¿Está bloqueada esta clave ahora mismo? */
export function isBlocked(key: string): boolean {
  const a = attempts.get(key);
  if (!a?.blockedUntil) return false;
  if (a.blockedUntil <= Date.now()) {
    attempts.delete(key);
    return false;
  }
  return true;
}

/** Registra un intento fallido y devuelve si a partir de ahora queda bloqueado. */
export function registerFailure(key: string): boolean {
  const now = Date.now();
  if (attempts.size > MAX_KEYS) sweep(now);

  const a = attempts.get(key);
  if (!a || now - a.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now });
    return false;
  }

  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) {
    a.blockedUntil = now + BLOCK_MS;
    return true;
  }
  return false;
}

/** Limpia el contador tras un inicio de sesión correcto. */
export function clearAttempts(key: string) {
  attempts.delete(key);
}
