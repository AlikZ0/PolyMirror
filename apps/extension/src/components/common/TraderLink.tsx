import { Link } from 'react-router-dom';
import { shortAddress } from '../../utils/format';

export function TraderLink({ address, name }: { address: string; name?: string | null }) {
  return (
    <Link
      to={`/traders/${address}`}
      className="font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      title={address}
    >
      {name || shortAddress(address)}
    </Link>
  );
}
