import type { RequestHandler } from './$types';

interface Article {
	title: string;
	source: string;
	url?: string;
}

const NEWS_API_KEY = 'adb3c70aeb8d496d9fd30a6d53b05fce';

// Using NewsAPI.org with provided API key - fetching multiple categories
export const GET: RequestHandler = async () => {
	try {
		// Fetch from multiple categories to get diverse news
		const categories = ['general', 'business', 'technology', 'sports', 'entertainment'];
		const allArticles: Article[] = [];

		// Fetch from multiple sources in parallel
		const fetchPromises = categories.map((category) =>
			fetch(
				`https://newsapi.org/v2/top-headlines?country=us&category=${category}&apiKey=${NEWS_API_KEY}&pageSize=50`
			)
		);

		const responses = await Promise.all(fetchPromises);

		for (const response of responses) {
			if (!response.ok) {
				console.warn(`API responded with status: ${response.status}`);
				continue;
			}

			const data = await response.json();

			// Add articles from this category
			const articles: Article[] = (data.articles || []).map((article: any) => ({
				title: article.title || 'Untitled',
				source: article.source?.name || 'News',
				url: article.url
			}));

			allArticles.push(...articles);
		}

		// Remove duplicates based on title
		const uniqueArticles = Array.from(
			new Map(allArticles.map((article) => [article.title, article])).values()
		);

		// Shuffle articles for variety
		const shuffled = uniqueArticles.sort(() => Math.random() - 0.5);

		return new Response(JSON.stringify({ articles: shuffled }), {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, max-age=300' // Cache for 5 minutes to get fresh news more often
			}
		});
	} catch (error) {
		console.error('News API Error:', error);

		// Fallback news if API fails
		const fallbackArticles: Article[] = [
			{
				title: 'Global Tech Innovation Accelerates in 2026',
				source: 'Tech News'
			},
			{
				title: 'International Markets See Strong Recovery',
				source: 'Finance'
			},
			{
				title: 'New Scientific Breakthrough Announced',
				source: 'Science'
			},
			{
				title: 'Climate Action Initiative Gains Momentum',
				source: 'World News'
			},
			{
				title: 'Cultural Exchanges Foster Global Understanding',
				source: 'Culture'
			},
			{
				title: 'Sports Teams Clinch Championship Titles',
				source: 'Sports'
			},
			{
				title: 'Entertainment Industry Celebrates New Releases',
				source: 'Entertainment'
			},
			{
				title: 'Business Leaders Announce Strategic Partnerships',
				source: 'Business'
			}
		];

		return new Response(JSON.stringify({ articles: fallbackArticles }), {
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}
};
