import { useState } from 'react'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

// A multi-choice filter in a sheet: tick any number of rows, "Clear" unticks them all, "Apply"
// hands the ticked values back and closes. Nothing changes behind the sheet until Apply.
// `options`: [{ value, label }]; `values`: the values ticked when it opens.
export default function FilterSheet({ title, options, values, onApply, close }) {
  const [sel, setSel] = useState(values)
  const toggle = v => setSel(cur => cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v])
  return <>
    <div className="row between"><h3 style={{ margin: 0 }}>{title}</h3>
      <Button size="sm" variant="ghost" onClick={() => setSel([])}>{t('Clear')}</Button></div>
    <div className="sect-b">
      {options.map(o => {
        const on = sel.includes(o.value)
        return <button key={o.value} className={'lrow tap' + (on ? ' on' : '')} aria-pressed={on} onClick={() => toggle(o.value)}>
          <span className="lrow-m"><span className="lrow-t">{o.label}</span></span>
          {on && <Icon name="check" className="lrow-k" />}
        </button>
      })}
    </div>
    <div className="fs-apply"><Button variant="primary" onClick={() => { onApply(sel); close() }}>{t('Apply')}</Button></div>
  </>
}
