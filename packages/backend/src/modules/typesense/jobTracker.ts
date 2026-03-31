import { v4 as uuidv4 } from 'uuid';

interface SyncJob {
	id: string;
	entity: string;
	status: 'pending' | 'running' | 'completed' | 'failed';
	progress?: string;
	result?: any;
	error?: string;
	startedAt: Date;
	completedAt?: Date;
}

// In-memory job tracker (consider Redis for production multi-instance setups)
const jobs = new Map<string, SyncJob>();

// Auto-cleanup: remove jobs older than 1 hour
setInterval(() => {
	const oneHourAgo = Date.now() - 60 * 60 * 1000;
	for (const [id, job] of jobs.entries()) {
		if (job.completedAt && job.completedAt.getTime() < oneHourAgo) {
			jobs.delete(id);
		}
	}
}, 5 * 60 * 1000); // Run every 5 minutes

export function createJob(entity: string): string {
	const jobId = uuidv4();
	jobs.set(jobId, {
		id: jobId,
		entity,
		status: 'pending',
		startedAt: new Date(),
	});
	return jobId;
}

export function updateJob(jobId: string, updates: Partial<Omit<SyncJob, 'id' | 'entity' | 'startedAt'>>) {
	const job = jobs.get(jobId);
	if (!job) return;
	
	Object.assign(job, updates);
	if (updates.status === 'completed' || updates.status === 'failed') {
		job.completedAt = new Date();
	}
}

export function getJob(jobId: string): SyncJob | undefined {
	return jobs.get(jobId);
}

export function getAllJobs(): SyncJob[] {
	return Array.from(jobs.values()).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
}
