export interface ArenaLoadStatusProps {
  loading: boolean;
  error: string;
  retry: () => void;
  empty: boolean;
}

export function ArenaLoadStatus({
  loading,
  error,
  retry,
  empty,
}: ArenaLoadStatusProps) {
  if (loading) return <p role="status">Đang tải dữ liệu sân…</p>;
  if (error)
    return (
      <p role="alert">
        {error}{' '}
        <button type="button" className="arena-button" onClick={retry}>
          Thử lại
        </button>
      </p>
    );
  return empty ? <p>Chưa có dữ liệu sân được công bố.</p> : null;
}
