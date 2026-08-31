import { Link } from 'react-router-dom';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { paths } from '@/routes';

/**
 * Neutral, employee-safe fallback shown for unknown URLs (and for supervisor-only
 * routes when signed out). It deliberately exposes NOTHING about the admin area
 * or the sign-in page — employees should only reach check-in/out via the QR code
 * their supervisor shows them.
 */
export function NotFoundPage() {
  return (
    <Screen width="sm">
      <Card className="p-8 text-center">
        <div className="text-5xl">📱</div>
        <h1 className="mt-4 text-2xl font-bold">Attendance</h1>
        <p className="mt-2 text-ink-500">
          To check in or out, scan the QR code your supervisor shows you.
        </p>
        <div className="mt-6">
          <Link to={paths.recover}>
            <Button variant="outline" fullWidth>
              I forgot my code
            </Button>
          </Link>
        </div>
      </Card>
    </Screen>
  );
}
