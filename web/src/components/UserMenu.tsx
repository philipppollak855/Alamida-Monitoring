import { useAuth } from '../auth/AuthContext';

export function UserMenu() {
  const { user, profile, signOut } = useAuth();

  if (!user) return null;

  return (
    <div className="user-menu">
      <span className="user-menu-label" title={user.email ?? ''}>
        {profile?.displayName ?? user.email}
      </span>
      <button
        type="button"
        className="btn-ghost btn-small user-menu-logout"
        onClick={() => signOut()}
        title="Abmelden"
        aria-label="Abmelden"
      >
        <span className="user-menu-logout-full">Abmelden</span>
        <span className="user-menu-logout-short" aria-hidden>
          ⎋
        </span>
      </button>
    </div>
  );
}
