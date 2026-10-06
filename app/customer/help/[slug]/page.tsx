import { helpPages } from '@/lib/help/helpPages';
import HelpArticle from '../_HelpArticle';

// Every help page is known at build time; any other slug is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return helpPages().map((page) => ({ slug: page.slug }));
}

export default async function CustomerHelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <HelpArticle slug={slug} />;
}
