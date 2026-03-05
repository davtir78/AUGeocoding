import React, { useEffect, useState } from 'react';
import {
    Box,
    Typography,
    List,
    ListItem,
    ListItemText,
    Chip,
    IconButton,
    Paper,
    CircularProgress,
    Button
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import config from '../../amplifyconfiguration.json';

const HTTP_API_BASE_URL = import.meta.env.VITE_HTTP_API_BASE_URL ||
    config.API?.REST?.GeocodingAPI?.endpoint ||
    'https://{api-id}.execute-api.{region}.amazonaws.com';
import { fetchAuthSession } from 'aws-amplify/auth';

interface Job {
    jobId: string;
    createdAt: string; // ISO string
    status: 'PROCESSING' | 'COMPLETED' | 'ERROR' | 'NOT_FOUND';
    downloadUrl?: string;
}

const STORAGE_KEY = 'aws-geo-batch-jobs';

const JobStatusList: React.FC<{ refreshTrigger: number }> = ({ refreshTrigger }) => {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(false);

    // 1. Load jobs from localStorage
    const loadJobsFromStorage = () => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (!Array.isArray(parsed)) return [];

                // Filter out invalid jobs to prevent crashes
                const validJobs = parsed.filter((j: any) => j && typeof j.jobId === 'string' && j.createdAt);

                // Sort by date desc
                return validJobs.sort((a: Job, b: Job) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
            } catch (e) {
                console.error("Failed to parse jobs", e);
                return [];
            }
        }
        return [];
    };

    // 2. Poll Status for all non-completed jobs
    const checkStatuses = async () => {
        setLoading(true);
        const currentJobs = loadJobsFromStorage();
        let updated = false;

        const updatedJobs = await Promise.all(currentJobs.map(async (job: Job) => {
            // Skip completed jobs to prevent unnecessary polling
            if (job.status === 'COMPLETED') return job;

            try {
                // Get JWT token for Authorization header
                const session = await fetchAuthSession();
                const token = session.tokens?.idToken?.toString();

                // Call API
                const url = `${HTTP_API_BASE_URL}/jobs/${job.jobId}`;
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) throw new Error(`Server returned ${response.status}`);

                const data: any = await response.json();

                if (data.status !== job.status) {
                    updated = true;
                    return {
                        ...job,
                        status: data.status,
                        downloadUrl: data.download_url
                    };
                }
            } catch (err: any) {
                console.error(`Failed to check job ${job.jobId}`, err);
                if (err.response) {
                    console.error('Error response:', err.response);
                } else if (err.message) {
                    console.error('Error message:', err.message);
                }
            }
            return job;
        }));

        if (updated) {
            setJobs(updatedJobs);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedJobs));
        } else {
            setJobs(currentJobs);
        }
        setLoading(false);
    };

    // Initial load & Poll
    useEffect(() => {
        checkStatuses();
        const interval = setInterval(checkStatuses, 5000); // Poll every 5s
        return () => clearInterval(interval);
    }, [refreshTrigger]);

    const handleDownload = async (job: Job) => {
        try {
            // Get JWT token for Authorization header
            const session = await fetchAuthSession();
            const token = session.tokens?.idToken?.toString();

            // Fetch fresh URL to avoid expiry
            const url = `${HTTP_API_BASE_URL}/jobs/${job.jobId}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            const data: any = await response.json();

            if (data.download_url) {
                window.open(data.download_url, '_blank');
            } else {
                alert('Download URL not found');
            }
        } catch (e) {
            console.error('Failed to get download URL', e);
            alert('Failed to download results. Please try again.');
        }
    };

    const clearHistory = () => {
        if (window.confirm('Clear job history?')) {
            localStorage.removeItem(STORAGE_KEY);
            setJobs([]);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'COMPLETED': return 'success';
            case 'PROCESSING': return 'warning';
            case 'ERROR': return 'error';
            default: return 'default';
        }
    };

    if (jobs.length === 0) {
        return (
            <Box sx={{ mt: 4, textAlign: 'center', color: 'text.secondary' }}>
                <Typography variant="body2">No recent batch jobs found.</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ mt: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontFamily: 'serif', fontWeight: 600 }}>
                    Recent Jobs
                </Typography>
                <Box>
                    <IconButton onClick={checkStatuses} disabled={loading} size="small">
                        {loading ? <CircularProgress size={20} /> : <RefreshIcon />}
                    </IconButton>
                    <IconButton onClick={clearHistory} size="small" color="error">
                        <DeleteIcon />
                    </IconButton>
                </Box>
            </Box>

            <Paper variant="outlined">
                <List sx={{ p: 0 }}>
                    {jobs.map((job, index) => (
                        <React.Fragment key={job.jobId}>
                            <ListItem
                                secondaryAction={
                                    job.status === 'COMPLETED' && (
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            startIcon={<DownloadIcon />}
                                            onClick={() => handleDownload(job)}
                                            sx={{ color: '#2e7d32', borderColor: '#2e7d32' }}
                                        >
                                            Download
                                        </Button>
                                    )
                                }
                            >
                                <ListItemText
                                    primary={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="subtitle2" fontFamily="monospace">
                                                {job.jobId.slice(0, 8)}...
                                            </Typography>
                                            <Chip
                                                label={job.status}
                                                size="small"
                                                color={getStatusColor(job.status) as any}
                                                variant="outlined"
                                                sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
                                            />
                                        </Box>
                                    }
                                    secondary={new Date(job.createdAt).toLocaleString()}
                                />
                            </ListItem>
                            {index < jobs.length - 1 && <Box sx={{ borderBottom: '1px solid #f0f0f0' }} />}
                        </React.Fragment>
                    ))}
                </List>
            </Paper>
        </Box>
    );
};

export default JobStatusList;
