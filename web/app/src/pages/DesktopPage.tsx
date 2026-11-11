import { PageHeader } from '@/components/PageHeader';
import { useExtension } from '@/extension/useExtension';
import { desktopVersion } from '@/desktop';
import { SpotifyIntegration, DiscordIntegration } from './IntegrationSettings';
import { AccountButton } from '@/shell/AccountButton';
import { settingsUi } from './settingsStyles';

export default function DesktopPage() {
  const status = useExtension();
  return <div className={settingsUi.centered}>
    <PageHeader title="BitChord for Windows" />
    <div className={settingsUi.body}>
      <section className={settingsUi.group}>
        <div className={settingsUi.row}><span>Version</span><span className={settingsUi.value}>{desktopVersion}</span></div>
        <div className={settingsUi.row}><span>Music services</span><span className={settingsUi.value}>{status.state === 'present' ? 'Ready' : status.state === 'checking' ? 'Connecting…' : 'Unavailable — restart BitChord'}</span></div>
      </section>
      <p className={settingsUi.footer}>Your music services are built in. Sign in here to connect your accounts; no browser extension is needed.</p>
      <h2 className={settingsUi.sectionHeader}>Accounts</h2>
      <section className={settingsUi.group}>
        <div className={settingsUi.row}><span>YouTube Music</span><AccountButton /></div>
        <div className={settingsUi.row}><span>Spotify</span><SpotifyIntegration /></div>
        <div className={settingsUi.row}><span>Discord</span><DiscordIntegration /></div>
      </section>
      <h2 className={settingsUi.sectionHeader}>About this build</h2>
      <section className={settingsUi.group}><div className={settingsUi.row}>
        <p className="type-body text-secondary">A community Windows port of BitChord’s v1.9.1 web player. Search, queues, lyrics, crossfade and Automix use the upstream player. Android-only USB exclusive output, offline downloads and local-library scanning are not included.</p>
      </div></section>
      <p className={settingsUi.footer}>Listen Together requires a party server address in Settings. Account integrations depend on their providers and may require signing in again.</p>
      <a className="type-body text-key hover:underline" href="https://github.com/kushagrasinghx/BitChord/tree/v1.9.1" target="_blank" rel="noreferrer">BitChord source · GPLv3</a>
    </div>
  </div>;
}
