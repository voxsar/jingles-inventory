import Typesense from 'typesense';
import logger from '../../utils/logger';

const client = new Typesense.Client({
	nodes: [
		{
			host: process.env.TYPESENSE_HOST || 'typesense.artslabcreatives.com',
			port: parseInt(process.env.TYPESENSE_PORT || '443'),
			protocol: process.env.TYPESENSE_PROTOCOL || 'https',
		},
	],
	apiKey: process.env.TYPESENSE_API_KEY || 'o0q4XFVi7qFgttoXvUmF8m4a9bMG9bRTLBI0pb',
	connectionTimeoutSeconds: 10,
});

export default client;

// Test connection helper
export async function testTypesenseConnection(): Promise<{ success: boolean; error?: string }> {
	try {
		const health = await client.health.retrieve();
		logger.info('Typesense connection successful', health);
		return { success: true };
	} catch (error: any) {
		logger.error('Typesense connection failed', error);
		return { success: false, error: error.message };
	}
}
