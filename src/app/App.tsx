import { I18nProvider } from './i18n';
import { useRoute } from './router';
import { Home } from './screens/Home';

function Screens() {
  const { route, go } = useRoute();
  switch (route) {
    default:
      return <Home go={go} />;
  }
}

export function App() {
  return (
    <I18nProvider>
      <Screens />
    </I18nProvider>
  );
}
