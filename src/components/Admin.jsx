import { Fragment, useCallback, useEffect, useState } from 'react'

const TOKEN_KEY = 'admin_token'

async function api(action, data = {}) {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data }),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

export default function Admin() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [password, setPassword] = useState('')
  const [loginErr, setLoginErr] = useState('')
  const [busy, setBusy] = useState(false)

  const [stats, setStats] = useState(null)
  const [codes, setCodes] = useState([])
  const [storeReady, setStoreReady] = useState(true)
  const [label, setLabel] = useState('')
  const [count, setCount] = useState(1)
  const [maxUses, setMaxUses] = useState('')
  const [custom, setCustom] = useState('')
  const [justCreated, setJustCreated] = useState([])
  const [err, setErr] = useState('')

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken('')
    setStats(null)
    setCodes([])
  }, [])

  const refresh = useCallback(async () => {
    if (!token) return
    const s = await api('stats', { token })
    if (s.status === 401) return logout()
    setStats(s.json.stats || null)
    setStoreReady(s.json.storeReady !== false)
    const c = await api('codes', { token })
    if (c.status === 401) return logout()
    setCodes(c.json.codes || [])
  }, [token, logout])

  useEffect(() => { refresh() }, [refresh])

  const doLogin = async (e) => {
    e.preventDefault()
    setBusy(true); setLoginErr('')
    const { status, json } = await api('login', { password })
    setBusy(false)
    if (status === 200 && json.token) {
      localStorage.setItem(TOKEN_KEY, json.token)
      setToken(json.token)
      setPassword('')
    } else {
      setLoginErr(json.error || 'Login failed')
    }
  }

  const generate = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(''); setJustCreated([])
    const { status, json } = await api('generate', { token, label, count, maxUses })
    setBusy(false)
    if (status === 401) return logout()
    if (!json.ok) return setErr(json.error || 'Failed to generate')
    setJustCreated(json.created || [])
    setLabel('')
    refresh()
  }

  const createCustom = async (e) => {
    e.preventDefault()
    const code = custom.trim()
    if (!code) return
    setBusy(true); setErr(''); setJustCreated([])
    const { status, json } = await api('custom', { token, code, label, maxUses })
    setBusy(false)
    if (status === 401) return logout()
    if (!json.ok) return setErr(json.error || 'Failed to create code')
    setJustCreated(json.created || [])
    setCustom(''); setLabel('')
    refresh()
  }

  const [ipsFor, setIpsFor] = useState('')
  const [ipsData, setIpsData] = useState({})
  const viewIps = async (code) => {
    if (ipsFor === code) { setIpsFor(''); return }
    setIpsFor(code)
    const { status, json } = await api('ips', { token, code })
    if (status === 401) return logout()
    setIpsData((d) => ({ ...d, [code]: json.ips || [] }))
  }

  const setActive = async (code, active) => {
    await api(active ? 'activate' : 'revoke', { token, code })
    refresh()
  }
  const editLimit = async (code, current) => {
    const v = prompt(`Max uses for "${code}"  (0 or blank = unlimited):`, current || 0)
    if (v === null) return // cancelled
    await api('setlimit', { token, code, maxUses: v })
    refresh()
  }
  const del = async (code) => {
    if (!confirm(`Delete ${code}? This cannot be undone.`)) return
    await api('delete', { token, code })
    refresh()
  }

  // ---- Login screen ----
  if (!token) {
    return (
      <div className="admin-login">
        <form className="admin-card" onSubmit={doLogin}>
          <h1>Admin</h1>
          <p className="muted">Enter the admin password to continue.</p>
          <input
            className="admin-input" type="password" placeholder="Password" autoFocus
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          {loginErr && <span className="admin-err">{loginErr}</span>}
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Log in'}</button>
        </form>
      </div>
    )
  }

  // ---- Dashboard ----
  return (
    <div className="admin">
      <header className="admin-head">
        <h1>Ultimate Channels — Admin</h1>
        <div className="admin-head-actions">
          <button className="btn ghost" onClick={refresh}>Refresh</button>
          <button className="btn ghost" onClick={logout}>Log out</button>
        </div>
      </header>

      {!storeReady && (
        <div className="admin-warn">
          Storage isn’t configured — set <code>UPSTASH_REDIS_REST_URL</code> and
          <code>UPSTASH_REDIS_REST_TOKEN</code> in Vercel to generate codes and track stats.
        </div>
      )}

      <section className="admin-stats">
        <Stat label="Total codes" value={stats?.totalCodes} />
        <Stat label="Active codes" value={stats?.activeCodes} />
        <Stat label="Revoked" value={stats?.revokedCodes} />
        <Stat label="VIP unlocks" value={stats?.unlocksOk} />
        <Stat label="Failed attempts" value={stats?.unlocksFailed} />
        <Stat label="Total checks" value={stats?.checks} />
      </section>

      <section className="admin-panel">
        <h2>Create VIP codes</h2>
        <input
          className="admin-input" placeholder="Label (optional, e.g. 'June promo') — applies to whichever you create below"
          value={label} onChange={(e) => setLabel(e.target.value)} style={{ width: '100%', marginBottom: '10px' }}
        />
        <input
          className="admin-input" type="number" min="0"
          placeholder="Max uses (blank or 0 = unlimited) — how many times the code can be entered"
          value={maxUses} onChange={(e) => setMaxUses(e.target.value)} style={{ width: '100%', marginBottom: '14px' }}
        />

        <div className="admin-subhead">Your own code</div>
        <form className="admin-gen" onSubmit={createCustom}>
          <input
            className="admin-input" placeholder="Type your code, e.g. GOLDENVIP (letters, digits, - or _)"
            value={custom} onChange={(e) => setCustom(e.target.value)}
          />
          <button className="btn" type="submit" disabled={busy}>Add code</button>
        </form>

        <div className="admin-subhead" style={{ marginTop: '16px' }}>Or generate random codes</div>
        <form className="admin-gen" onSubmit={generate}>
          <input
            className="admin-input narrow" type="number" min="1" max="100"
            value={count} onChange={(e) => setCount(e.target.value)}
          />
          <button className="btn ghost" type="submit" disabled={busy}>{busy ? 'Working…' : 'Generate random'}</button>
        </form>
        {err && <span className="admin-err">{err}</span>}
        {justCreated.length > 0 && (
          <div className="admin-created">
            <div className="admin-created-head">
              <span>Created {justCreated.length} code{justCreated.length > 1 ? 's' : ''}:</span>
              <button className="btn ghost" onClick={() => navigator.clipboard.writeText(justCreated.join('\n'))}>Copy all</button>
            </div>
            <code>{justCreated.join('  •  ')}</code>
          </div>
        )}
      </section>

      <section className="admin-panel">
        <h2>Codes ({codes.length})</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Code</th><th>Label</th><th>Created</th><th>Used</th><th>Max</th><th>IPs</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const exhausted = c.maxUses > 0 && (c.redeemed || 0) >= c.maxUses
                return (
                <Fragment key={c.code}>
                  <tr className={c.active ? '' : 'revoked'}>
                    <td>
                      <button className="link-btn" title="Copy" onClick={() => navigator.clipboard.writeText(c.code)}>
                        {c.code}
                      </button>
                    </td>
                    <td>{c.label || '—'}</td>
                    <td>{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}</td>
                    <td>{c.redeemed || 0}</td>
                    <td>
                      <button className="link-btn" title="Set usage limit (0 = unlimited)" onClick={() => editLimit(c.code, c.maxUses || 0)}>
                        {c.maxUses > 0 ? c.maxUses : '∞'} ✎
                      </button>
                    </td>
                    <td>
                      {c.ips > 0
                        ? <button className="link-btn" onClick={() => viewIps(c.code)}>{c.ips} {c.ips === 1 ? 'IP' : 'IPs'} {ipsFor === c.code ? '▴' : '▾'}</button>
                        : <span className="muted">0</span>}
                    </td>
                    <td>{!c.active ? <span className="tag-off">Revoked</span> : exhausted ? <span className="tag-off">Used up</span> : <span className="tag-on">Active</span>}</td>
                    <td className="admin-row-actions">
                      {c.active
                        ? <button className="link-btn warn" onClick={() => setActive(c.code, false)}>Revoke</button>
                        : <button className="link-btn" onClick={() => setActive(c.code, true)}>Activate</button>}
                      <button className="link-btn warn" onClick={() => del(c.code)}>Delete</button>
                    </td>
                  </tr>
                  {ipsFor === c.code && (
                    <tr className="admin-ips-row">
                      <td colSpan="8">
                        <div className="admin-ips">
                          {(ipsData[c.code] || []).length === 0
                            ? <span className="muted">No IPs recorded yet.</span>
                            : (ipsData[c.code] || []).map((r) => (
                                <div className="admin-ip" key={r.ip}>
                                  <code>{r.ip}</code>
                                  <span className="muted">{r.count} use{r.count === 1 ? '' : 's'}</span>
                                  <span className="muted">last {r.last ? new Date(r.last).toLocaleString() : '—'}</span>
                                </div>
                              ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
                )
              })}
              {codes.length === 0 && (
                <tr><td colSpan="8" className="muted" style={{ padding: '18px', textAlign: 'center' }}>No codes yet — create some above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value ?? '—'}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
