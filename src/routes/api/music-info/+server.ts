import type { RequestHandler } from './$types';

interface WikipediaInfo {
	title: string;
	excerpt: string;
}

// Random music-related topics to fetch
const musicTopics = [
	'Rock music',
	'Electronic music',
	'Jazz',
	'Classical music',
	'Hip hop music',
	'Pop music',
	'Blues',
	'Country music',
	'Reggae',
	'Folk music',
	'Metal music',
	'Disco',
	'Punk rock',
	'Indie rock',
	'Acoustic guitar',
	'Piano',
	'Violin',
	'Drums',
	'Bass guitar',
	'Harmonica',
	'Music history',
	'Musicology',
	'Sound recording',
	'Audio engineering',
	'Live concert',
	'Music festival',
	'Record label',
	'Gramophone record',
	'Digital audio'
];

export const GET: RequestHandler = async ({ url }) => {
	try {
		let query = url.searchParams.get('query');
		let topic = query || musicTopics[Math.floor(Math.random() * musicTopics.length)];

		// First search for the topic to get the most relevant page
		let searchResponse = await fetch(
			`https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=5`,
			{ signal: AbortSignal.timeout(5000) }
		);

		if (searchResponse.ok) {
			const searchData = await searchResponse.json();
			const searchResults = searchData.query?.search || [];
			
			if (searchResults.length > 0) {
				// Find the best result - prefer ones with "music" in title if available
				let bestResult = searchResults[0];
				
				if (query && !query.toLowerCase().includes('music')) {
					// Look for a music-related result
					for (const result of searchResults) {
						if (result.title.toLowerCase().includes('music')) {
							bestResult = result;
							break;
						}
					}
					
					// If we didn't find a music result and first is disambiguation, try again with " music" added
					if (bestResult === searchResults[0] && bestResult.title.includes('(disambiguation)')) {
						const musicQuery = `${topic} music`;
						const musicSearchResponse = await fetch(
							`https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(musicQuery)}&srlimit=1`,
							{ signal: AbortSignal.timeout(5000) }
						);
						
						if (musicSearchResponse.ok) {
							const musicData = await musicSearchResponse.json();
							const musicResults = musicData.query?.search || [];
							if (musicResults.length > 0) {
								bestResult = musicResults[0];
							}
						}
					}
				}
				
				topic = bestResult.title;
			}
		}

		// Fetch full article content by title with timeout
		const extractResponse = await fetch(
			`https://en.wikipedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(topic)}&prop=extracts&explaintext=true&exsectionformat=plain`,
			{ signal: AbortSignal.timeout(5000) }
		);

		if (!extractResponse.ok) {
			throw new Error(`Wikipedia extract failed: ${extractResponse.status}`);
		}

		const extractData = await extractResponse.json();
		const pages = extractData.query?.pages || {};
		const page = Object.values(pages)[0] as any;

		if (!page || !page.extract) {
			throw new Error('No extract found');
		}

		// Get first 2500 characters of the article for full content
		const excerpt = page.extract.slice(0, 2500);

		return new Response(
			JSON.stringify({
				title: topic,
				excerpt: excerpt,
				source: 'Wikipedia'
			}),
			{
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, max-age=30'
				}
			}
		);
	} catch (error) {
		console.error('Wikipedia API Error:', error);

		// Fallback music facts
		const fallbackFacts = [
			{
				title: 'Rock Music',
				excerpt:
					'Rock is a broad genre of popular music that originated as "rock and roll" in the United States in the late 1940s and early 1950s.'
			},
			{
				title: 'Electronic Music',
				excerpt:
					'Electronic music is music that employs electronic musical instruments, digital instruments, or circuitry-based music technology in its creation.'
			},
			{
				title: 'Jazz',
				excerpt:
					'Jazz is a music genre that originated in the African-American communities of New Orleans, United States, in the late 19th and early 20th centuries.'
			},
			{
				title: 'Classical Music',
				excerpt:
					'Classical music is a broad term that usually refers to formal European music heard from roughly the middle of the Common Era to the present day.'
			},
			{
				title: 'Hip Hop',
				excerpt:
					'Hip hop music or hip-hop music is a music genre consisting of a stylized rhythmic music that commonly accompanies rapping, a rhythmic and rhyming speech.'
			},
			{
				title: 'Pop Music',
				excerpt:
					'Pop music is a genre of popular music that originated in its modern form during the 1950s in the United States and the United Kingdom.'
			},
			{
				title: 'Blues',
				excerpt:
					'The blues is a music genre and musical form which was originated in the Deep South of the United States around the 1860s by African-Americans.'
			}
		];

		const random = fallbackFacts[Math.floor(Math.random() * fallbackFacts.length)];

		return new Response(JSON.stringify(random), {
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}
};
