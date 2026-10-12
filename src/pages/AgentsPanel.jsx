import { useState } from 'react';
import { addAgent, deleteAgent } from '../lib/api.js';

// Manage the agent list used by the Agent dropdowns. Deleting an agent does not change existing holds.
export default function AgentsPanel({ agents, holds, onClose, onChanged }) {
  const [name, setName] = useState('');
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [q, setQ] = useState('');
  const uses = (n) => holds.filter((h) => h.agent === n).length;

  async function onAdd(e) {
    e.preventDefault();
    const n = name.replace(/\s+/g, ' ').trim().toUpperCase();
    if (!n) return setMsg({ kind: 'err', text: 'Type the agent name.' });
    try {
      await addAgent(n);
      setName('');
      await onChanged();
      setMsg({ kind: 'ok', text: `Added ${n}.` });
    } catch (err) { setMsg({ kind: 'err', text: err.message }); }
  }

  async function onDelete(a) {
    const n = uses(a.name);
    const note = n ? ` They have ${n} hold(s); those stay as they are. You can add the name again later.` : '';
    if (!window.confirm(`Delete agent ${a.name} from the list?${note}`)) return;
    try {
      await deleteAgent(a.id);
      await onChanged();
      setMsg({ kind: 'ok', text: `Deleted ${a.name}.` });
    } catch (err) { setMsg({ kind: 'err', text: err.message }); }
  }

  const shown = agents.filter((a) => a.name.includes(q.trim().toUpperCase()));

  return (
    <section className="panel">
      <h3>Agents ({agents.length})</h3>
      <form className="iform" onSubmit={onAdd}>
        <label>New agent<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SM GENE" /></label>
        <button className="btn" style={{ alignSelf: 'end' }}>Add agent</button>
        <label>Search<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an agent" /></label>
      </form>
      <div className={`msg ${msg.kind}`} role="status" style={{ margin: '8px 0' }}>{msg.text}</div>
      <div className="tbl">
        <table>
          <thead><tr><th>Agent</th><th>Holds</th><th></th></tr></thead>
          <tbody>
            {shown.length ? shown.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td><td>{uses(a.name)}</td>
                <td><button className="mini" onClick={() => onDelete(a)}>Delete</button></td>
              </tr>
            )) : <tr><td colSpan={3} className="note">No agents found.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="act" style={{ marginTop: 12 }}>
        <button className="mini" type="button" onClick={onClose}>Close</button>
      </div>
    </section>
  );
}
