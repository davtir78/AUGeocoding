import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import JobStatusList from './JobStatusList';
import * as AmplifyApi from 'aws-amplify/api';

// Mock Amplify API
vi.mock('aws-amplify/api', () => ({
    get: vi.fn()
}));

// Mock window.open
const mockOpen = vi.fn();
window.open = mockOpen;

// Mock alert
window.alert = vi.fn();

describe('JobStatusList', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('renders without crashing even with corrupted local storage', async () => {
        const corruptedData = JSON.stringify([
            null,
            { status: 'PROCESSING' }, // missing jobId
            { jobId: 'valid-job', createdAt: new Date().toISOString(), status: 'PROCESSING' }
        ]);
        localStorage.setItem('aws-geo-batch-jobs', corruptedData);

        render(<JobStatusList refreshTrigger={0} />);

        // Should find the valid job - use findByText to wait for async render
        expect(await screen.findByText(/valid-job/)).toBeInTheDocument();
    });

    it('handles download by fetching fresh URL', async () => {
        const job = {
            jobId: 'job-123',
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            downloadUrl: 'http://old-url.com'
        };
        localStorage.setItem('aws-geo-batch-jobs', JSON.stringify([job]));

        // Mock API response for fresh URL
        const mockResponse = {
            response: Promise.resolve({
                body: {
                    json: () => Promise.resolve({ download_url: 'http://fresh-url.com', status: 'COMPLETED' })
                }
            })
        };
        (AmplifyApi.get as any).mockReturnValue(mockResponse);

        render(<JobStatusList refreshTrigger={0} />);

        // Wait for button to be rendered
        const downloadBtn = await screen.findByText('Download');
        fireEvent.click(downloadBtn);

        await waitFor(() => {
            expect(AmplifyApi.get).toHaveBeenCalledWith({
                apiName: 'GeocodingAPI',
                path: '/jobs/job-123'
            });
            expect(mockOpen).toHaveBeenCalledWith('http://fresh-url.com', '_blank');
        });
    });
});
