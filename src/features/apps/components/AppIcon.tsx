import { ServiceIcon } from '@/features/services/components/ServiceIcon'
import { appDomain } from '@/features/apps/utils/app-domain'

interface AppIconProps {
  /** The app's process name and real OS icon, if the OS gave one. */
  app: { name: string; icon: string | null }
}

/** An app's icon: its real OS icon, else its brand's favicon guessed from the
 *  process name, else a monogram. */
export function AppIcon({ app }: AppIconProps): JSX.Element | null {
  return <ServiceIcon src={app.icon} host={appDomain(app.name)} name={app.name} />
}
