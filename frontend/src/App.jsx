import { useState, useEffect, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts'

const C = { debito: '#2563EB', credito: '#059669', prepago: '#D97706', accent: '#1E3A5F', bg: '#F8FAFC', border: '#E2E8F0', text: '#0F172A', muted: '#64748B' }

const SAMPLE = {
  periodo: 'Q4 2024',
  instituciones: [
    { codigo: '001', nombre: 'Banco de Chile', tipo: 'banco', debito: 8542000, credito: 4218000, prepago: 152000 },
    { codigo: '009', nombre: 'Banco Santander', tipo: 'banco', debito: 7198000, credito: 3821000, prepago: 83000 },
    { codigo: '014', nombre: 'BancoEstado', tipo: 'banco', debito: 9823000, credito: 2134000, prepago: 428000 },
    { codigo: '028', nombre: 'Banco BICE', tipo: 'banco', debito: 451000, credito: 382000, prepago: 5200 },
    { codigo: '037', nombre: 'Banco Itaú', tipo: 'banco', debito: 3214000, credito: 2891000, prepago: 47000 },
    { codigo: '049', nombre: 'Banco Security', tipo: 'banco', debito: 682000, credito: 524000, prepago: 8100 },
    { codigo: '055', nombre: 'Banco Falabella', tipo: 'banco', debito: 2112000, credito: 3489000, prepago: 124000 },
    { codigo: '051', nombre: 'Banco Ripley', tipo: 'banco', debito: 892000, credito: 1810000, prepago: 67000 },
    { codigo: '039', nombre: 'Scotiabank', tipo: 'banco', debito: 2340000, credito: 1980000, prepago: 32000 },
    { codigo: '045', nombre: 'HSBC Bank', tipo: 'banco', debito: 312000, credito: 289000, prepago: 0 },
    { codigo: '672', nombre: 'Coopeuch', tipo: 'cooperativa', debito: 1203000, credito: 451000, prepago: 384000 },
    { codigo: '870', nombre: 'COOCRETAL', tipo: 'cooperativa', debito: 45000, credito: 12000, prepago: 2100 },
    { codigo: '871', nombre: 'Capual', tipo: 'cooperativa', debito: 38000, credito: 8200, prepago: 1500 },
    { codigo: '875', nombre: 'Detacoop', tipo: 'cooperativa', debito: 29000, credito: 5400, prepago: 800 },
  ]
}

const fmt = (n) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
  return n?.toLocaleString('es-CL') ?? '0'
}

const fmtFull = (n) => n?.toLocaleString('es-CL') ?? '0'

function KPI({ label, value, color, sub }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || C.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function TabBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 20px', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14,
      background: active ? C.accent : 'transparent', color: active ? '#fff' : C.muted,
      transition: 'all 0.15s'
    }}>{label}</button>
  )
}

function MixBar({ debito, credito, prepago }) {
  const total = debito + credito + prepago || 1
  return (
    <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', width: '100%' }}>
      <div style={{ width: `${debito / total * 100}%`, background: C.debito }} />
      <div style={{ width: `${credito / total * 100}%`, background: C.credito }} />
      <div style={{ width: `${prepago / total * 100}%`, background: C.prepago }} />
    </div>
  )
}

const PROMPT = `Extrae datos de tarjetas emitidas. Responde SOLO JSON sin markdown: {"periodo":"string","instituciones":[{"codigo":"string","nombre":"string","tipo":"banco"|"cooperativa","debito":number,"credito":number,"prepago":number}]} Busca tablas de tarjetas emitidas por tipo. Usa 0 si no hay dato. Incluye TODAS las instituciones.`

export default function App() {
  const [data, setData] = useState(null)
  const [isDemo, setIsDemo] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [cardFilter, setCardFilter] = useState('total')
  const [sortBy, setSortBy] = useState('total')
  const [sortDir, setSortDir] = useState('desc')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    fetch('./data/latest.json')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => {
        if (d?.instituciones?.length) { setData(d); setIsDemo(false) }
        else setData(SAMPLE)
      })
      .catch(() => setData(SAMPLE))
  }, [])

  const instituciones = data?.instituciones ?? []
  const total = (inst) => inst.debito + inst.credito + inst.prepago
  const totDebito = instituciones.reduce((s, i) => s + i.debito, 0)
  const totCredito = instituciones.reduce((s, i) => s + i.credito, 0)
  const totPrepago = instituciones.reduce((s, i) => s + i.prepago, 0)
  const totTotal = totDebito + totCredito + totPrepago
  const bancos = instituciones.filter(i => i.tipo === 'banco')
  const coops = instituciones.filter(i => i.tipo === 'cooperativa')

  const handlePDF = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('Falta VITE_ANTHROPIC_API_KEY en el entorno')
      const b64 = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result.split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(file)
      })
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-calls': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
              { type: 'text', text: PROMPT }
            ]
          }]
        })
      })
      if (!resp.ok) throw new Error(`API error ${resp.status}`)
      const result = await resp.json()
      const text = result.content?.[0]?.text ?? ''
      const parsed = JSON.parse(text)
      if (parsed?.instituciones?.length) { setData(parsed); setIsDemo(false) }
      else throw new Error('JSON inesperado del modelo')
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ─── OVERVIEW TAB ──────────────────────────────────────────────────────────
  const overviewData = instituciones
    .sort((a, b) => total(b) - total(a))
    .slice(0, 12)
    .map(i => ({ name: i.nombre.replace('Banco ', '').replace('banco ', ''), debito: i.debito, credito: i.credito, prepago: i.prepago }))

  const sectorData = [
    { name: 'Bancos', debito: bancos.reduce((s, i) => s + i.debito, 0), credito: bancos.reduce((s, i) => s + i.credito, 0), prepago: bancos.reduce((s, i) => s + i.prepago, 0) },
    { name: 'Cooperativas', debito: coops.reduce((s, i) => s + i.debito, 0), credito: coops.reduce((s, i) => s + i.credito, 0), prepago: coops.reduce((s, i) => s + i.prepago, 0) },
  ]

  // ─── RANKING TAB ──────────────────────────────────────────────────────────
  const rankingField = cardFilter === 'debito' ? 'debito' : cardFilter === 'credito' ? 'credito' : cardFilter === 'prepago' ? 'prepago' : null
  const rankingInst = [...instituciones]
    .sort((a, b) => (rankingField ? b[rankingField] - a[rankingField] : total(b) - total(a)))
    .slice(0, 10)
  const rankingMax = rankingInst.length ? (rankingField ? Math.max(...rankingInst.map(i => i[rankingField])) : Math.max(...rankingInst.map(total))) : 1

  // ─── DETAIL TAB ────────────────────────────────────────────────────────────
  const sortedInst = [...instituciones].sort((a, b) => {
    const va = sortBy === 'total' ? total(a) : sortBy === 'nombre' ? a.nombre.localeCompare(b.nombre) : a[sortBy]
    const vb = sortBy === 'total' ? total(b) : sortBy === 'nombre' ? b.nombre.localeCompare(a.nombre) : b[sortBy]
    if (sortBy === 'nombre') return sortDir === 'asc' ? va : -va
    return sortDir === 'desc' ? vb - va : va - vb
  })

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const SortIcon = ({ col }) => sortBy === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ' ·'

  if (!data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: C.muted, fontSize: 16 }}>
      Cargando datos…
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', -apple-system, sans-serif", color: C.text }}>
      {/* ─── HEADER ─── */}
      <header style={{ background: C.accent, borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '0 32px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📊</div>
            <div>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em' }}>CMF Tarjetas</span>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginLeft: 8 }}>Chile</span>
            </div>
            {isDemo && (
              <span style={{ background: '#D97706', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, letterSpacing: '0.05em' }}>DEMO</span>
            )}
            {data.periodo && (
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginLeft: 4 }}>Período: {data.periodo}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handlePDF} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)',
                background: uploading ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)',
                color: '#fff', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              {uploading ? '⏳ Procesando…' : '⬆ Subir PDF CMF'}
            </button>
          </div>
        </div>
        {/* Tabs */}
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', gap: 4, paddingBottom: 0 }}>
          {[['overview', 'Vista general'], ['ranking', 'Ranking'], ['detalle', 'Detalle']].map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)} style={{
              padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
              color: activeTab === id ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 14,
              borderBottom: activeTab === id ? '2px solid #fff' : '2px solid transparent',
              transition: 'all 0.15s'
            }}>{label}</button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 32px' }}>
        {uploadError && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 16px', color: '#DC2626', fontSize: 13, marginBottom: 16 }}>
            Error al procesar PDF: {uploadError}
          </div>
        )}

        {/* ─── KPIs ─── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <KPI label="Total sistema" value={fmt(totTotal)} sub="tarjetas emitidas" />
          <KPI label="Débito" value={fmt(totDebito)} color={C.debito} sub={`${((totDebito / totTotal) * 100).toFixed(1)}% del total`} />
          <KPI label="Crédito" value={fmt(totCredito)} color={C.credito} sub={`${((totCredito / totTotal) * 100).toFixed(1)}% del total`} />
          <KPI label="Prepago" value={fmt(totPrepago)} color={C.prepago} sub={`${((totPrepago / totTotal) * 100).toFixed(1)}% del total`} />
          <KPI label="Instituciones" value={instituciones.length} sub={`${bancos.length} bancos · ${coops.length} coops`} />
        </div>

        {/* ─── TAB: VISTA GENERAL ─── */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: C.accent }}>Mix por institución (top 12)</h2>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={overviewData} margin={{ top: 0, right: 0, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.muted }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: C.muted }} width={48} />
                  <Tooltip formatter={(v, n) => [fmtFull(v), n.charAt(0).toUpperCase() + n.slice(1)]} contentStyle={{ borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
                  <Bar dataKey="debito" stackId="a" fill={C.debito} name="Débito" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="credito" stackId="a" fill={C.credito} name="Crédito" />
                  <Bar dataKey="prepago" stackId="a" fill={C.prepago} name="Prepago" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: C.accent }}>Bancos vs Cooperativas</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sectorData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                  <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 11, fill: C.muted }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: C.text }} width={100} />
                  <Tooltip formatter={(v, n) => [fmtFull(v), n.charAt(0).toUpperCase() + n.slice(1)]} contentStyle={{ borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  <Bar dataKey="debito" stackId="a" fill={C.debito} name="Débito" />
                  <Bar dataKey="credito" stackId="a" fill={C.credito} name="Crédito" />
                  <Bar dataKey="prepago" stackId="a" fill={C.prepago} name="Prepago" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ─── TAB: RANKING ─── */}
        {activeTab === 'ranking' && (
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.accent }}>Top 10 emisores</h2>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['total', 'Total'], ['debito', 'Débito'], ['credito', 'Crédito'], ['prepago', 'Prepago']].map(([val, lbl]) => (
                  <button key={val} onClick={() => setCardFilter(val)} style={{
                    padding: '5px 12px', borderRadius: 6, border: `1px solid ${cardFilter === val ? C.accent : C.border}`,
                    background: cardFilter === val ? C.accent : '#fff', color: cardFilter === val ? '#fff' : C.muted,
                    cursor: 'pointer', fontSize: 12, fontWeight: 600
                  }}>{lbl}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rankingInst.map((inst, idx) => {
                const v = rankingField ? inst[rankingField] : total(inst)
                const pct = (v / rankingMax) * 100
                const barColor = cardFilter === 'debito' ? C.debito : cardFilter === 'credito' ? C.credito : cardFilter === 'prepago' ? C.prepago : C.accent
                return (
                  <div key={inst.codigo} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 24, textAlign: 'right', color: C.muted, fontSize: 13, fontWeight: 600 }}>{idx + 1}</div>
                    <div style={{ width: 220, fontSize: 13, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inst.nombre}
                      <span style={{ marginLeft: 6, fontSize: 11, color: C.muted }}>{inst.tipo === 'cooperativa' ? 'COOP' : 'BANCO'}</span>
                    </div>
                    <div style={{ flex: 1, background: C.bg, borderRadius: 4, height: 20, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ width: 72, textAlign: 'right', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: barColor }}>{fmt(v)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ─── TAB: DETALLE ─── */}
        {activeTab === 'detalle' && (
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}` }}>
                  {[['nombre', 'Institución'], ['tipo', 'Tipo'], ['debito', 'Débito'], ['credito', 'Crédito'], ['prepago', 'Prepago'], ['total', 'Total']].map(([col, lbl]) => (
                    <th key={col} onClick={() => handleSort(col)} style={{
                      padding: '12px 16px', textAlign: col === 'nombre' || col === 'tipo' ? 'left' : 'right',
                      cursor: 'pointer', userSelect: 'none', fontWeight: 700, color: C.accent,
                      fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap'
                    }}>
                      {lbl}<SortIcon col={col} />
                    </th>
                  ))}
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: C.accent, fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', width: 120 }}>Mix</th>
                </tr>
              </thead>
              <tbody>
                {sortedInst.map((inst, idx) => {
                  const t = total(inst)
                  return (
                    <tr key={inst.codigo} style={{ borderBottom: `1px solid ${C.border}`, background: idx % 2 === 0 ? '#fff' : C.bg }}>
                      <td style={{ padding: '10px 16px', fontWeight: 500, color: C.text }}>{inst.nombre}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                          background: inst.tipo === 'banco' ? '#EFF6FF' : '#F0FDF4',
                          color: inst.tipo === 'banco' ? C.debito : C.credito
                        }}>{inst.tipo === 'banco' ? 'BANCO' : 'COOP'}</span>
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.debito, fontWeight: 600 }}>{fmtFull(inst.debito)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.credito, fontWeight: 600 }}>{fmtFull(inst.credito)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: C.prepago, fontWeight: 600 }}>{fmtFull(inst.prepago)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtFull(t)}</td>
                      <td style={{ padding: '10px 16px', minWidth: 120 }}><MixBar debito={inst.debito} credito={inst.credito} prepago={inst.prepago} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <footer style={{ textAlign: 'center', padding: '24px 32px', color: C.muted, fontSize: 12, borderTop: `1px solid ${C.border}`, marginTop: 40 }}>
        Datos: CMF Chile · Actualización automática vía GitHub Actions · Procesado con Claude AI
      </footer>
    </div>
  )
}
