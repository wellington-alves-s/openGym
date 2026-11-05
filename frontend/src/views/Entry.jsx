// Trainer mode, nobody signed in: who is this? The answer only picks which sign-in comes next
// (Login.jsx): a student's account is made by their trainer, a trainer can make their own.
import { t } from '../lib/i18n.js'
import { Button } from '../components/ui.jsx'

export default function Entry({ onPick }) {
  return <>
    <Button variant="primary" onClick={() => onPick('student')}>{t("I'm a student")}</Button>
    <div style={{ height: 10 }} />
    <Button onClick={() => onPick('trainer')}>{t("I'm a personal trainer")}</Button>
  </>
}
