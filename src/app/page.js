// Server component: reads the (possibly operator-overridden) editor templates from the
// disk-backed registry and seeds the client editor with them. See src/lib/templates.js.
import HomeClient from './HomeClient';
import { getTemplates } from '@/lib/templates';

export default function Home() {
  const templates = getTemplates();
  return <HomeClient templates={templates} />;
}
