/**
 * Smoke test for the built browser half.
 *
 * Loads `lib/client.js` the way the profile's client-modules service does —
 * `window.__ModuleLoader__.load({ id, factory })`, with `require` answering for
 * the product's own packages — then drives the plugin's `apply` against a fake
 * client context and asserts the two registrations it must make. This catches a
 * broken bundle (hand-rolled CJS inlining included) and a wrong slot key before
 * anything is mounted into a real GUI.
 *
 *   node scripts/smoke-client.mjs
 */
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

/** The minimum of React the panel touches. */
const react = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useMemo: factory => factory(),
  useCallback: callback => callback,
  useRef: initial => ({ current: initial }),
}

const failures = []
const check = (label, condition) => {
  if (!condition) failures.push(label)
  process.stdout.write(`${condition ? 'ok  ' : 'FAIL'} ${label}\n`)
}

let loaded
globalThis.window = { __ModuleLoader__: { load: module => { loaded = module } } }
// eslint-disable-next-line no-new-func
new Function(source)()
check('bundle calls __ModuleLoader__.load', loaded !== undefined)
check('bundle id is the package name', loaded?.id === 'dsh-source-control')

const requireStub = id => {
  if (id === 'react') return react
  throw new Error(`unexpected external require: ${id}`)
}
const exports_ = loaded.factory(requireStub)
check('factory returns apply()', typeof exports_?.apply === 'function')
check('client declares the slots service', Array.isArray(exports_.inject) && exports_.inject.includes('slots'))

const tabDefinitions = []
const slotRegistrations = []
const injections = []
const ctx = {
  slots: {
    inject: (name, callback) => {
      injections.push(name)
      const disposer = callback()
      if (typeof disposer !== 'function') failures.push(`slots.inject(${name}) returned no disposer`)
      return disposer
    },
    register: (options, component) => {
      slotRegistrations.push({ options, component })
      return () => {}
    },
  },
  effect: callback => { callback() },
  inject: (names, callback) => {
    callback({
      get: name => {
        if (name !== 'sidebarRightTabs') return undefined
        return { register: definition => { tabDefinitions.push(definition); return () => {} } }
      },
    })
  },
}

exports_.apply(ctx)
check('injects into the slots service', injections.includes('sidebar.right.pane.tab'))
check('registers exactly one tab type', tabDefinitions.length === 1)
check('tab kind is source-control', tabDefinitions[0]?.kind === 'source-control')
check('tab type carries a guide entry', Array.isArray(tabDefinitions[0]?.guide) && tabDefinitions[0].guide.length > 0)
check('tab title resolves', typeof tabDefinitions[0]?.title('') === 'string' && tabDefinitions[0].title('') !== '')
check('registers one panel body', slotRegistrations.length === 1)
check('body is keyed by the type id', slotRegistrations[0]?.options?.key === tabDefinitions[0]?.id)
check('body slot name is the native seat', slotRegistrations[0]?.options?.name === 'sidebar.right.pane.tab')

const injected = slotRegistrations[0]?.options?.inject?.('session-1')
check('inject factory carries the session id', injected?.sessionId === 'session-1')
const rendered = slotRegistrations[0]?.component(injected)
check('panel renders a node', rendered !== undefined && rendered !== null)

process.stdout.write(failures.length === 0 ? '\nsmoke-client: PASS\n' : `\nsmoke-client: FAIL (${failures.length})\n`)
process.exit(failures.length === 0 ? 0 : 1)
