import {useTheme, type ThemeChoice} from '../theme';
import {Section, Segmented, SubScreen} from './ui';

const THEMES: {value: ThemeChoice; label: string}[] = [
  {value: 'system', label: 'System'},
  {value: 'light', label: 'Light'},
  {value: 'dark', label: 'Dark'},
];

export function SettingsView() {
  const [theme, setTheme] = useTheme();
  return (
    <SubScreen title="Settings" back={{name: 'today'}}>
      <Section title="Theme">
        <Segmented
          label="Theme"
          options={THEMES}
          value={theme}
          onChange={setTheme}
        />
        <p className="mt-2 text-[13px] text-dim">
          The same on this device as the dashboard&apos;s.
        </p>
      </Section>
    </SubScreen>
  );
}
