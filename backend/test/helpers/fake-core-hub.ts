import { AddressInfo } from 'net';
import { IncomingMessage, ServerResponse, createServer, Server } from 'http';
import { decodeJwt } from 'jose';
import { TestSigningKey, jwksDocument } from './token-factory';

/** An answer Core Hub gives instead of data. */
export interface CoreHubFailure {
  status: number;
  /** The Retry-After header, e.g. "120". */
  retryAfter?: string;
}

/** Core roles that may read other people (reference-data.md 2.2: lecturer, staff, admin). */
const PEOPLE_READERS = new Set(['lecturer', 'staff', 'admin']);

/**
 * A minimal stand-in for Core Hub, used by the e2e suite. It serves what the
 * subsystem reads from the real Core Hub: the JWKS document (public keys
 * only), the caller's own person (GET /api/v1/people/me) and one person by
 * code (GET /api/v1/people/:personCode). Both people routes need a Bearer
 * token like the real ones, answer 403 to a role that may not read them, and
 * are never cached by the subsystem.
 */
export class FakeCoreHub {
  private server?: Server;
  private keys: TestSigningKey[] = [];

  /** JWKS downloads. */
  requestCount = 0;

  /** GET /api/v1/people/me calls. */
  peopleRequests = 0;
  /** GET /api/v1/people/:personCode calls. */
  personLookups = 0;
  /** The Authorization header of the latest /people call. */
  lastPeopleAuthorization: string | undefined;
  /**
   * While set, the people routes answer with this status (and Retry-After), as
   * Core Hub does when it is down (503), rate limiting (429) or has ended the
   * user's session (401).
   */
  peopleFailure: CoreHubFailure | null = null;
  /** The person linked to each account, by `sub`; anyone else is linked to none. */
  private people = new Map<string, Record<string, unknown>>();

  async start(keys: TestSigningKey[]): Promise<void> {
    this.keys = keys;
    this.server = createServer((req, res) => {
      if (req.url?.startsWith('/api/v1/.well-known/jwks.json')) {
        this.requestCount += 1;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(jwksDocument(this.keys)));
        return;
      }
      const person = /^\/api\/v1\/people\/([^/?]+)/.exec(req.url ?? '');
      if (person) {
        if (person[1] === 'me') {
          this.servePeopleMe(req, res);
        } else {
          this.servePerson(decodeURIComponent(person[1]), req, res);
        }
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });

    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
  }

  /** Simulates Core Hub key rotation. */
  rotate(keys: TestSigningKey[]): void {
    this.keys = keys;
  }

  /** People Core Hub has linked to accounts, by the account's `sub`. */
  setPeople(people: Record<string, Record<string, unknown>>): void {
    this.people = new Map(Object.entries(people));
  }

  /** The caller's claims, read without verifying them - the subsystem did. */
  private callerOf(
    req: IncomingMessage,
    res: ServerResponse,
  ): { sub?: unknown; role?: unknown } | undefined {
    this.lastPeopleAuthorization = req.headers.authorization;

    const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
    let claims: { sub?: unknown; role?: unknown } | undefined;
    try {
      claims = token ? decodeJwt(token) : undefined;
    } catch {
      claims = undefined;
    }
    if (!claims) {
      this.send(res, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'token required' } });
      return undefined;
    }
    if (this.peopleFailure) {
      this.fail(res, this.peopleFailure);
      return undefined;
    }
    return claims;
  }

  /**
   * GET /api/v1/people/me as Core Hub answers it: the person linked to the
   * caller's `sub`, `data: null` when there is none, and 403 for a guest.
   */
  private servePeopleMe(req: IncomingMessage, res: ServerResponse): void {
    this.peopleRequests += 1;
    const claims = this.callerOf(req, res);
    if (!claims) {
      return;
    }
    if (claims.role === 'guest') {
      this.send(res, 403, { success: false, error: { code: 'FORBIDDEN', message: 'people:me:read' } });
      return;
    }
    this.send(res, 200, {
      success: true,
      data: this.people.get(String(claims.sub)) ?? null,
      requestId: 'fake-core-hub',
      timestamp: new Date().toISOString(),
    });
  }

  /** GET /api/v1/people/:personCode - lecturer, staff and admin only; 404 for a code nobody has. */
  private servePerson(personCode: string, req: IncomingMessage, res: ServerResponse): void {
    this.personLookups += 1;
    const claims = this.callerOf(req, res);
    if (!claims) {
      return;
    }
    if (!PEOPLE_READERS.has(String(claims.role))) {
      this.send(res, 403, { success: false, error: { code: 'FORBIDDEN', message: 'people:read' } });
      return;
    }
    const person = [...this.people.values()].find((candidate) => candidate.personCode === personCode);
    if (!person) {
      this.send(res, 404, { success: false, error: { code: 'NOT_FOUND', message: 'person not found' } });
      return;
    }
    this.send(res, 200, {
      success: true,
      data: person,
      requestId: 'fake-core-hub',
      timestamp: new Date().toISOString(),
    });
  }

  private send(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  /** Core Hub's error envelope - every 5xx carries INTERNAL_ERROR, so status is what counts. */
  private fail(res: ServerResponse, failure: CoreHubFailure): void {
    res.writeHead(failure.status, {
      'content-type': 'application/json',
      ...(failure.retryAfter !== undefined ? { 'retry-after': failure.retryAfter } : {}),
    });
    res.end(
      JSON.stringify({
        success: false,
        error: { code: failure.status >= 500 ? 'INTERNAL_ERROR' : 'ERROR', message: 'fake failure' },
      }),
    );
  }

  get port(): number {
    return (this.server!.address() as AddressInfo).port;
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  get jwksUrl(): string {
    return `${this.url}/api/v1/.well-known/jwks.json`;
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve, reject) =>
        this.server!.close((error) => (error ? reject(error) : resolve())),
      );
      this.server = undefined;
    }
  }
}
