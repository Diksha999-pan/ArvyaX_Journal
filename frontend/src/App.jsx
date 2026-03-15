import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

const API = '/api/journal'

const AMBIENCES = [
  { value: 'forest',   label: '🌲 Forest' },
  { value: 'ocean',    label: '🌊 Ocean' },
  { value: 'mountain', label: '⛰️ Mountain' },
  { value: 'rain',     label: '🌧️ Rain' },
  { value: 'nature',   label: '🌿 Nature' },
]

const EMOTION_COLORS = {
  calm: '#4caf50', happy: '#ffc107', anxious: '#ff7043',
  sad: '#7986cb', energized: '#26c6da', reflective: '#ab47bc',
  grateful: '#ffb300', stressed: '#ef5350',
}

export default function App() {
  const [userId]           = useState(() => localStorage.getItem('arvyax_userId') || (() => { const id = 'user_' + Math.random().toString(36).slice(2,7); localStorage.setItem('arvyax_userId', id); return id; })())
  const [tab, setTab]      = useState('write')
  const [text, setText]    = useState('')
  const [ambience, setAmbience] = useState('forest')
  const [entries, setEntries]   = useState([])
  const [insights, setInsights] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState('')

  // Streaming state
  const [streaming, setStreaming]         = useState(false)
  const [streamEmotion, setStreamEmotion] = useState(null)
  const [streamKeywords, setStreamKeywords] = useState([])
  const [streamText, setStreamText]       = useState('')
  const [streamDone, setStreamDone]       = useState(false)
  const [analyzeLoading, setAnalyzeLoading] = useState(null)

  useEffect(() => {
    if (tab === 'entries') fetchEntries()
    if (tab === 'insights') fetchInsights()
  }, [tab])

  async function fetchEntries() {
    try {
      const { data } = await axios.get(`${API}/${userId}`)
      setEntries(data.entries)
    } catch { setMsg('Failed to load entries') }
  }

  async function fetchInsights() {
    try {
      const { data } = await axios.get(`${API}/insights/${userId}`)
      setInsights(data)
    } catch { setMsg('Failed to load insights') }
  }

  async function handleSave() {
    if (!text.trim()) return setMsg('Please write something first!')
    setLoading(true); setMsg('')
    try {
      await axios.post(API, { userId, ambience, text })
      setMsg('✅ Entry saved!')
      setText('')
      resetStream()
    } catch { setMsg('❌ Failed to save entry') }
    setLoading(false)
  }

  function resetStream() {
    setStreaming(false); setStreamEmotion(null)
    setStreamKeywords([]); setStreamText(''); setStreamDone(false)
  }

  // ── STREAMING analyze using EventSource + fetch ───────────────────────────
  async function handleStreamAnalyze(entryText, entryId) {
    resetStream()
    setStreaming(true)
    setStreamDone(false)
    setAnalyzeLoading(entryId || 'new')

    try {
      const response = await fetch('/api/journal/analyze/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: entryText, entryId }),
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalResult = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const parsed = JSON.parse(line.slice(6))
            if (parsed.type === 'token') {
              setStreamText(prev => prev + parsed.token)
            } else if (parsed.type === 'emotion') {
              setStreamEmotion(parsed.emotion)
            } else if (parsed.type === 'keywords') {
              setStreamKeywords(parsed.keywords)
            } else if (parsed.type === 'done') {
              finalResult = parsed.result
              setStreamDone(true)
              // If analyzing an existing entry, save result + update list
              if (entryId && finalResult) {
                await axios.post('/api/journal/analyze', { text: entryText, entryId })
                setEntries(prev => prev.map(e => e.id === entryId
                  ? { ...e, emotion: finalResult.emotion, keywords: finalResult.keywords, summary: finalResult.summary, analyzed: true }
                  : e))
              }
            }
          } catch {}
        }
      }
    } catch (err) {
      setMsg('❌ Streaming failed')
    }

    setStreaming(false)
    setAnalyzeLoading(null)
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const S = {
    app:        { maxWidth: 800, margin: '0 auto', padding: '24px 16px' },
    header:     { textAlign: 'center', marginBottom: 32 },
    logo:       { fontSize: 40, marginBottom: 4 },
    title:      { fontSize: 28, fontWeight: 700, color: '#a5d6a7', letterSpacing: '-0.5px' },
    subtitle:   { color: '#81c784', fontSize: 14, marginTop: 4 },
    badge:      { background: '#1b3a20', border: '1px solid #2e7d32', borderRadius: 20, padding: '4px 14px', fontSize: 12, color: '#69f0ae', display: 'inline-block', marginTop: 8 },
    tabs:       { display: 'flex', gap: 8, marginBottom: 24, background: '#1b3a20', borderRadius: 12, padding: 6 },
    tab:   (a) => ({ flex: 1, padding: '10px 0', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14, transition: 'all .2s', background: a ? '#2e7d32' : 'transparent', color: a ? '#fff' : '#81c784' }),
    card:       { background: '#1b3a20', borderRadius: 16, padding: 24, marginBottom: 16, border: '1px solid #2e7d32' },
    label:      { fontSize: 13, color: '#a5d6a7', marginBottom: 8, display: 'block', fontWeight: 600 },
    ambiRow:    { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
    ambiBtn:(a) => ({ padding: '8px 16px', border: `1px solid ${a ? '#69f0ae' : '#2e7d32'}`, borderRadius: 20, cursor: 'pointer', background: a ? '#1b5e20' : 'transparent', color: a ? '#69f0ae' : '#81c784', fontSize: 13, fontWeight: a ? 600 : 400 }),
    textarea:   { width: '100%', minHeight: 140, background: '#0d1f13', border: '1px solid #2e7d32', borderRadius: 10, padding: 14, color: '#e8f5e9', fontSize: 15, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, outline: 'none' },
    btnRow:     { display: 'flex', gap: 10, marginTop: 14 },
    btn:   (c) => ({ padding: '10px 22px', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14, background: c, color: '#fff' }),
    streamBox:  { background: '#0a2010', border: '1px solid #1b5e20', borderRadius: 12, padding: 18, marginTop: 14 },
    emotionChip:(e) => ({ display: 'inline-block', background: EMOTION_COLORS[e] || '#4caf50', color: '#fff', borderRadius: 20, padding: '4px 14px', fontWeight: 700, fontSize: 14, marginRight: 8, transition: 'all .3s' }),
    keyword:    { display: 'inline-block', background: '#1b5e20', border: '1px solid #388e3c', borderRadius: 12, padding: '3px 10px', fontSize: 12, color: '#a5d6a7', marginRight: 6, marginTop: 4 },
    entryCard:  { background: '#1b3a20', borderRadius: 14, padding: 18, marginBottom: 14, border: '1px solid #2e7d32' },
    entryText:  { fontSize: 15, lineHeight: 1.7, color: '#e8f5e9', marginBottom: 12 },
    entryMeta:  { fontSize: 12, color: '#81c784', marginBottom: 8 },
    statGrid:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 },
    statCard:   { background: '#0d1f13', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px solid #2e7d32' },
    statNum:    { fontSize: 28, fontWeight: 700, color: '#69f0ae' },
    statLabel:  { fontSize: 12, color: '#81c784', marginTop: 4 },
    msg:        { background: '#1b3a20', border: '1px solid #388e3c', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14, color: '#a5d6a7' },
    trendRow:   { display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1b3a20' },
    empty:      { textAlign: 'center', color: '#4caf50', padding: '40px 0', fontSize: 15 },
    cursor:     { display: 'inline-block', width: 2, height: '1em', background: '#69f0ae', marginLeft: 2, animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom' },
  }

  return (
    <div style={S.app}>
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} } @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }`}</style>

      <div style={S.header}>
        <div style={S.logo}>🌿</div>
        <h1 style={S.title}>ArvyaX Journal</h1>
        <p style={S.subtitle}>AI-assisted nature session journal</p>
        <span style={S.badge}>👤 {userId}</span>
      </div>

      <div style={S.tabs}>
        {[['write','✍️ Write'],['entries','📖 Entries'],['insights','📊 Insights']].map(([id,label]) => (
          <button key={id} style={S.tab(tab===id)} onClick={() => { setTab(id); setMsg('') }}>{label}</button>
        ))}
      </div>

      {msg && <div style={S.msg}>{msg}</div>}

      {/* ── WRITE TAB ── */}
      {tab === 'write' && (
        <div style={S.card}>
          <label style={S.label}>Session Ambience</label>
          <div style={S.ambiRow}>
            {AMBIENCES.map(a => (
              <button key={a.value} style={S.ambiBtn(ambience===a.value)} onClick={() => setAmbience(a.value)}>{a.label}</button>
            ))}
          </div>
          <label style={S.label}>Your Journal Entry</label>
          <textarea style={S.textarea} placeholder="Write about your nature session experience..." value={text} onChange={e => setText(e.target.value)} />
          <div style={S.btnRow}>
            <button style={S.btn('#2e7d32')} onClick={handleSave} disabled={loading}>
              {loading ? 'Saving...' : '💾 Save Entry'}
            </button>
            <button style={S.btn('#1565c0')} onClick={() => handleStreamAnalyze(text, null)} disabled={!text.trim() || streaming}>
              {streaming ? '⏳ Analyzing...' : '🧠 Analyze Emotion'}
            </button>
          </div>

          {/* Streaming result box */}
          {(streaming || streamText || streamEmotion) && (
            <div style={S.streamBox}>
              <p style={{ fontSize: 12, color: '#81c784', marginBottom: 10, letterSpacing: 1 }}>
                {streaming ? '✨ AI ANALYZING...' : '✅ ANALYSIS COMPLETE'}
              </p>

              {streamEmotion && (
                <div style={{ marginBottom: 10, animation: 'fadeIn .4s ease' }}>
                  <span style={S.emotionChip(streamEmotion)}>{streamEmotion}</span>
                </div>
              )}

              {streamKeywords.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {streamKeywords.map(k => <span key={k} style={S.keyword}>{k}</span>)}
                </div>
              )}

              <p style={{ fontSize: 14, color: '#c8e6c9', lineHeight: 1.7, minHeight: 24 }}>
                {streamText}
                {streaming && <span style={S.cursor} />}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── ENTRIES TAB ── */}
      {tab === 'entries' && (
        <div>
          {entries.length === 0
            ? <div style={S.empty}>No entries yet. Go write your first one! 🌱</div>
            : entries.map(entry => (
              <div key={entry.id} style={S.entryCard}>
                <div style={S.entryMeta}>
                  {AMBIENCES.find(a => a.value === entry.ambience)?.label || '🌿'} &nbsp;·&nbsp;
                  {new Date(entry.createdAt).toLocaleString()}
                </div>
                <p style={S.entryText}>{entry.text}</p>
                {entry.analyzed ? (
                  <div>
                    <span style={S.emotionChip(entry.emotion)}>{entry.emotion}</span>
                    <p style={{ fontSize: 13, color: '#a5d6a7', margin: '8px 0' }}>{entry.summary}</p>
                    <div>{entry.keywords?.map(k => <span key={k} style={S.keyword}>{k}</span>)}</div>
                  </div>
                ) : (
                  <div>
                    {analyzeLoading === entry.id && (streamText || streamEmotion) ? (
                      <div style={{ ...S.streamBox, marginTop: 0 }}>
                        {streamEmotion && <span style={S.emotionChip(streamEmotion)}>{streamEmotion}</span>}
                        <p style={{ fontSize: 13, color: '#c8e6c9', marginTop: 8, lineHeight: 1.7 }}>
                          {streamText}{analyzeLoading === entry.id && streaming && <span style={S.cursor} />}
                        </p>
                      </div>
                    ) : (
                      <button style={{ ...S.btn('#1565c0'), padding: '7px 16px', fontSize: 13 }}
                        onClick={() => { resetStream(); handleStreamAnalyze(entry.text, entry.id) }}
                        disabled={analyzeLoading === entry.id}>
                        {analyzeLoading === entry.id ? '⏳ Analyzing...' : '🧠 Analyze'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          }
        </div>
      )}

      {/* ── INSIGHTS TAB ── */}
      {tab === 'insights' && insights && (
        <div>
          <div style={S.statGrid}>
            <div style={S.statCard}>
              <div style={S.statNum}>{insights.totalEntries}</div>
              <div style={S.statLabel}>Total Entries</div>
            </div>
            <div style={S.statCard}>
              <div style={{ ...S.statNum, color: EMOTION_COLORS[insights.topEmotion] || '#69f0ae', fontSize: 22 }}>
                {insights.topEmotion || '—'}
              </div>
              <div style={S.statLabel}>Top Emotion</div>
            </div>
            <div style={S.statCard}>
              <div style={{ ...S.statNum, fontSize: 20 }}>
                {AMBIENCES.find(a => a.value === insights.mostUsedAmbience)?.label || insights.mostUsedAmbience || '—'}
              </div>
              <div style={S.statLabel}>Favourite Ambience</div>
            </div>
            <div style={S.statCard}>
              <div style={{ ...S.statNum, fontSize: 14, paddingTop: 6 }}>
                {insights.recentKeywords?.join(', ') || '—'}
              </div>
              <div style={S.statLabel}>Recent Keywords</div>
            </div>
          </div>
          {insights.emotionTrend?.length > 0 && (
            <div style={S.card}>
              <label style={S.label}>Emotion Timeline</label>
              {insights.emotionTrend.map((t, i) => (
                <div key={i} style={S.trendRow}>
                  <span style={S.emotionChip(t.emotion)}>{t.emotion}</span>
                  <span style={{ fontSize: 12, color: '#81c784' }}>{t.ambience}</span>
                  <span style={{ fontSize: 12, color: '#4caf50', marginLeft: 'auto' }}>
                    {new Date(t.date).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
