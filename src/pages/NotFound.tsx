import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui';

export function NotFound() {
  return (
    <EmptyState title="ページが見つかりません" action={<Link className="text-accent underline" to="/">コマンドセンターへ戻る</Link>}>
      モジュールが外されたか、URL が変わった可能性があります。
    </EmptyState>
  );
}
