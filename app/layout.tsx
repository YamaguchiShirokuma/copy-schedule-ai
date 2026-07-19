import './globals.css';
export const metadata = { title: 'コピペ予定AI', description: '貼り付け本文から予定候補を抽出してGoogleカレンダーへ追加' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ja"><body>{children}</body></html>; }
