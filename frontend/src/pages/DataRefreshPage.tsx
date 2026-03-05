import React, { useEffect, useState, useCallback } from 'react';
import {
    Box,
    Typography,
    Container,
    Paper,
    Button,
    Select,
    MenuItem,
    ToggleButton,
    ToggleButtonGroup,
    TextField,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    CircularProgress,
    Alert,
    IconButton,
    Collapse,
    Tooltip,
    Fade
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import PendingOutlinedIcon from '@mui/icons-material/PendingOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SaveIcon from '@mui/icons-material/Save';
import { get, post, del } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import config from '../amplifyconfiguration.json';

/* ─────────── Types ─────────── */
interface PipelineStep {
    StepName: string;
    status: 'IN_PROGRESS' | 'COMPLETED' | 'ERROR' | 'PENDING';
    message?: string;
    start_time?: string;
    end_time?: string;
    last_updated?: string;
}

interface ExecutionGroup {
    ExecutionId: string;
    steps: PipelineStep[];
    lastUpdated: string;
    overallStatus: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PENDING';
}

/* Pipeline steps in execution order ─ matches the Step Functions orchestrator */
/* Pipeline steps in execution order ─ matches the Step Functions orchestrator */
const PIPELINE_STEPS = [
    'VersionCheck',
    'DownloadGnaf',
    'Transform',
    'Ingestion',
    'SyntheticInjection',
    'PreEnrichment',
    'Indexing',
];

const STEP_LABELS: Record<string, string> = {
    VersionCheck: 'Version Check',
    DownloadGnaf: 'Download G-NAF',
    Transform: 'Transform',
    Ingestion: 'Ingestion',
    SyntheticInjection: 'Synthetic Injection',
    PreEnrichment: 'Spatial Enrichment',
    Indexing: 'OpenSearch Indexing',
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ─────────── Helpers ─────────── */

function statusChip(status: string) {
    const map: Record<string, { color: 'success' | 'error' | 'warning' | 'default'; label: string }> = {
        COMPLETED: { color: 'success', label: 'Complete' },
        RUNNING: { color: 'warning', label: 'Running' },
        FAILED: { color: 'error', label: 'Failed' },
        PENDING: { color: 'default', label: 'Pending' },
        IN_PROGRESS: { color: 'warning', label: 'Running' },
        ERROR: { color: 'error', label: 'Failed' },
    };
    const m = map[status] ?? { color: 'default' as const, label: status };
    return <Chip label={m.label} color={m.color} size="small" sx={{ fontWeight: 700, minWidth: 80 }} />;
}

function stepIcon(status: string) {
    switch (status) {
        case 'COMPLETED':
            return <CheckCircleOutlineIcon sx={{ color: '#4caf50', fontSize: 20 }} />;
        case 'IN_PROGRESS':
            return <CircularProgress size={18} sx={{ color: '#C8A74C' }} />;
        case 'ERROR':
            return <ErrorOutlineIcon sx={{ color: '#f44336', fontSize: 20 }} />;
        default:
            return <PendingOutlinedIcon sx={{ color: '#bbb', fontSize: 20 }} />;
    }
}

function formatDuration(start?: string, end?: string): string {
    if (!start) return '--';
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const diff = Math.max(0, Math.round((e - s) / 1000));
    if (diff < 60) return `${diff}s`;
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
}

function formatTime(ts?: string): string {
    if (!ts) return '--';
    return new Date(ts).toLocaleString('en-AU', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

function deriveOverallStatus(steps: PipelineStep[]): 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PENDING' {
    if (steps.some(s => s.status === 'ERROR')) return 'FAILED';
    if (steps.some(s => s.status === 'IN_PROGRESS')) return 'RUNNING';
    if (steps.length > 0 && steps.every(s => s.status === 'COMPLETED')) return 'COMPLETED';
    return 'PENDING';
}

/* ─────────── Component ─────────── */

const DataRefreshPage: React.FC = () => {
    const [executions, setExecutions] = useState<ExecutionGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [triggering, setTriggering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    // Schedule state
    const [frequency, setFrequency] = useState('Weekly');
    const [selectedDays, setSelectedDays] = useState<string[]>(['Sun']);
    const [scheduleTime, setScheduleTime] = useState('03:00');
    const [savingSchedule, setSavingSchedule] = useState(false);

    const getAuthHeaders = async (): Promise<Record<string, string>> => {
        const session = await fetchAuthSession();
        // Use ID Token because the JWT Authorizer checks the 'aud' (Client ID)
        const token = session.tokens?.idToken?.toString();
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    const fetchSchedule = useCallback(async () => {
        try {
            const restOperation = get({
                apiName: 'GeocodingAPI',
                path: '/refresh/schedule',
                options: { headers: await getAuthHeaders() }
            });
            const { body } = await restOperation.response;
            const data: any = await body.json();

            if (data.frequency) {
                // Map internal values to UI labels if needed
                const freqMap: Record<string, string> = {
                    'daily': 'Daily',
                    'weekly': 'Weekly',
                    'monthly': 'Monthly',
                    'off': 'Disabled'
                };
                setFrequency(freqMap[data.frequency] || 'Weekly');
                if (data.dayOfWeek) setSelectedDays([data.dayOfWeek.charAt(0).toUpperCase() + data.dayOfWeek.slice(1).toLowerCase()]);

                const h = String(data.hour || 0).padStart(2, '0');
                const m = String(data.minute || 0).padStart(2, '0');
                setScheduleTime(`${h}:${m}`);
            }
        } catch (err) {
            console.error('Failed to fetch schedule via Amplify:', err);
        }
    }, []);

    const fetchProgress = useCallback(async () => {
        setLoading(true);
        try {
            const restOperation = get({
                apiName: 'GeocodingAPI',
                path: '/refresh',
                options: { headers: await getAuthHeaders() }
            });
            const { body } = await restOperation.response;
            const data: any = await body.json();

            const groups: Record<string, PipelineStep[]> = {};
            data.forEach((item: any) => {
                if (!groups[item.ExecutionId]) groups[item.ExecutionId] = [];
                groups[item.ExecutionId].push(item);
            });

            const sorted = Object.entries(groups)
                .map(([id, steps]) => {
                    const lastUpdated = steps.reduce((latest, s) =>
                        (!latest || (s as any).last_updated > latest) ? (s as any).last_updated : latest, '');
                    return {
                        ExecutionId: id,
                        steps,
                        lastUpdated,
                        overallStatus: deriveOverallStatus(steps),
                    } as ExecutionGroup;
                })
                .sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));

            setExecutions(sorted);
            setError(null);

            // Auto-expand the first running execution
            const running = sorted.find(e => e.overallStatus === 'RUNNING');
            if (running) setExpandedRow(running.ExecutionId);
        } catch (err: any) {
            console.error('Failed to fetch progress', err);
            setError('Failed to load pipeline status. The API may be temporarily unavailable.');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleTrigger = async () => {
        if (!window.confirm('Start national G-NAF refresh now?\nThis pipeline typically runs for 4-6 hours.')) return;
        setTriggering(true);
        try {
            const restOperation = post({
                apiName: 'GeocodingAPI',
                path: '/refresh',
                options: { headers: await getAuthHeaders() }
            });
            await restOperation.response;
            setTimeout(fetchProgress, 2000);
        } catch (err) {
            console.error('Failed to trigger refresh:', err);
            alert('Failed to trigger refresh');
        } finally {
            setTriggering(false);
        }
    };

    useEffect(() => {
        fetchProgress();
        fetchSchedule();
        const isRunning = executions.some(e => e.overallStatus === 'RUNNING');
        const interval = setInterval(fetchProgress, isRunning ? 10000 : 30000);
        return () => clearInterval(interval);
    }, [fetchProgress, fetchSchedule]);

    const handleSaveSchedule = async () => {
        setSavingSchedule(true);
        try {
            const [hour, minute] = scheduleTime.split(':').map(Number);
            const freqValue = frequency.toLowerCase() === 'disabled' ? 'off' : frequency.toLowerCase();

            const restOperation = post({
                apiName: 'GeocodingAPI',
                path: '/refresh/schedule',
                options: {
                    headers: await getAuthHeaders(),
                    body: {
                        frequency: freqValue,
                        dayOfWeek: selectedDays[0]?.toUpperCase() || 'SUN',
                        hour,
                        minute,
                        timezone: 'Australia/Sydney'
                    }
                }
            });
            await restOperation.response;
            alert('Schedule updated successfully');
        } catch (err) {
            console.error('Failed to save schedule via Amplify:', err);
            alert('Failed to save schedule');
        } finally {
            setSavingSchedule(false);
        }
    };

    const handleStop = async (executionArn: string) => {
        if (!window.confirm('Are you sure you want to stop this pipeline execution?')) return;
        setLoading(true);
        try {
            const restOperation = post({
                apiName: 'GeocodingAPI',
                path: '/refresh/stop',
                options: {
                    headers: await getAuthHeaders(),
                    body: { executionArn }
                }
            });
            await restOperation.response;
            setTimeout(fetchProgress, 1000);
        } catch (err) {
            console.error('Failed to stop execution via Amplify:', err);
            alert('Failed to stop execution');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (executionId: string) => {
        if (!window.confirm('Are you sure you want to delete this execution record? This cannot be undone.')) return;
        setLoading(true);
        try {
            const restOperation = del({
                apiName: 'GeocodingAPI',
                path: `/refresh`,
                options: {
                    headers: await getAuthHeaders(),
                    queryParams: { execution_id: executionId }
                }
            });
            await restOperation.response;
            setTimeout(fetchProgress, 1000);
        } catch (err) {
            console.error('Failed to delete execution via Amplify:', err);
            alert('Failed to delete execution');
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedRow(prev => prev === id ? null : id);
    };

    const getStepData = (exec: ExecutionGroup, stepName: string): PipelineStep => {
        return exec.steps.find(s => s.StepName === stepName) ?? {
            StepName: stepName,
            status: 'PENDING'
        };
    };

    /* ─── Render ─── */
    return (
        <Container sx={{ py: 4, maxWidth: 'lg' }}>
            {/* ─── Header ─── */}
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight={800} sx={{ fontFamily: '"Playfair Display", serif', color: 'primary.main' }}>
                    Data Governance
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                    Monitor and manage the national G-NAF address refresh pipeline.
                </Typography>
            </Box>

            {/* ═══════════ TOP SECTION: Schedule & Controls ═══════════ */}
            <Paper sx={{
                p: 3, mb: 4, borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                background: 'linear-gradient(135deg, #fdfbf7 0%, #f8f5ec 100%)'
            }}>
                <Typography variant="h6" fontWeight={700} sx={{
                    mb: 2.5,
                    display: 'flex', alignItems: 'center', gap: 1,
                    fontFamily: '"Playfair Display", serif',
                    color: 'primary.main'
                }}>
                    <ScheduleIcon sx={{ color: 'primary.main' }} />
                    Schedule & Controls
                </Typography>

                <Box sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-end',
                    gap: 3
                }}>
                    {/* Frequency Dropdown */}
                    <Box>
                        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
                            Frequency
                        </Typography>
                        <Select
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value)}
                            size="small"
                            sx={{ minWidth: 130, bgcolor: 'white' }}
                        >
                            <MenuItem value="Daily">Daily</MenuItem>
                            <MenuItem value="Weekly">Weekly</MenuItem>
                            <MenuItem value="Monthly">Monthly</MenuItem>
                            <MenuItem value="Custom">Custom</MenuItem>
                        </Select>
                    </Box>

                    {/* Day of Week Toggle */}
                    <Box>
                        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
                            Day-of-Week
                        </Typography>
                        <ToggleButtonGroup
                            value={selectedDays}
                            onChange={(_, newDays) => { if (newDays.length) setSelectedDays(newDays); }}
                            size="small"
                            sx={{
                                '& .MuiToggleButton-root': {
                                    px: 1.5, py: 0.5,
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    border: '1px solid #d0c9b5',
                                    '&.Mui-selected': {
                                        bgcolor: 'primary.main',
                                        color: 'white',
                                        '&:hover': { bgcolor: 'primary.dark' }
                                    }
                                }
                            }}
                        >
                            {DAYS.map(d => (
                                <ToggleButton key={d} value={d}>{d}</ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                    </Box>

                    {/* Time Picker */}
                    <Box>
                        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
                            Time (AEST)
                        </Typography>
                        <TextField
                            type="time"
                            value={scheduleTime}
                            onChange={(e) => setScheduleTime(e.target.value)}
                            size="small"
                            sx={{ width: 150, bgcolor: 'white' }}
                            inputProps={{ step: 900 }}
                        />
                    </Box>

                    {/* Spacer + Actions */}
                    <Box sx={{ ml: 'auto', display: 'flex', gap: 2 }}>
                        <Button
                            variant="outlined"
                            size="large"
                            startIcon={savingSchedule ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                            onClick={handleSaveSchedule}
                            disabled={savingSchedule || loading}
                            sx={{
                                px: 3, py: 1.5,
                                borderRadius: 2,
                                fontWeight: 600,
                                color: 'primary.main',
                                borderColor: 'primary.main',
                                '&:hover': { borderColor: 'primary.dark', bgcolor: 'rgba(141,116,53,0.05)' },
                            }}
                        >
                            Save Changes
                        </Button>
                        <Button
                            variant="contained"
                            size="large"
                            startIcon={triggering ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
                            onClick={handleTrigger}
                            disabled={triggering || loading}
                            sx={{
                                px: 4, py: 1.5,
                                borderRadius: 2,
                                fontSize: '1rem',
                                fontWeight: 700,
                                bgcolor: 'primary.main',
                                '&:hover': { bgcolor: 'primary.dark' },
                                boxShadow: '0 2px 8px rgba(141,116,53,0.3)',
                            }}
                        >
                            Refresh Now
                        </Button>
                    </Box>
                </Box>
            </Paper>

            {/* ═══════════ Pipeline Architecture Visualization ═══════════ */}
            <Paper sx={{
                p: 2.5, mb: 3, borderRadius: 2,
                bgcolor: '#f8f5ec', border: '1px solid #e8e0c8',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)'
            }}>
                <Typography variant="subtitle2" fontWeight={800} color="primary.main" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                    PIPELINE ARCHITECTURE
                </Typography>
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 1.5
                }}>
                    {[
                        'Version Check', 'Download G-NAF', 'Transform (ECS)',
                        'Ingest (ECS)', 'Synthetic Injection', 'Spatial Enrichment', 'Indexing'
                    ].map((step, i, arr) => (
                        <React.Fragment key={step}>
                            <Box sx={{
                                px: 1.5, py: 0.75, borderRadius: 1,
                                bgcolor: 'white', border: '1px solid #d0c9b5',
                                fontSize: '0.75rem', fontWeight: 600, color: 'primary.dark'
                            }}>
                                {step}
                            </Box>
                            {i < arr.length - 1 && (
                                <Typography sx={{ color: '#d0c9b5', fontWeight: 900 }}>→</Typography>
                            )}
                        </React.Fragment>
                    ))}
                </Box>
            </Paper>

            {/* ═══════════ BOTTOM SECTION: Pipeline Runs ═══════════ */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" fontWeight={700} sx={{ fontFamily: '"Playfair Display", serif' }}>
                    Pipeline Runs
                </Typography>
                <Tooltip title="Refresh">
                    <span>
                        <IconButton onClick={fetchProgress} size="small" disabled={loading}>
                            <RefreshIcon fontSize="small" sx={{
                                color: 'primary.main',
                                animation: loading ? 'spin 1s linear infinite' : 'none',
                                '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } }
                            }} />
                        </IconButton>
                    </span>
                </Tooltip>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                <Table>
                    <TableHead sx={{ bgcolor: '#f8f5ec' }}>
                        <TableRow>
                            <TableCell sx={{ width: 40 }} />
                            <TableCell sx={{ fontWeight: 700 }}>Run ID</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Started</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Duration</TableCell>
                            <TableCell sx={{ fontWeight: 700, width: 60 }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {executions.length === 0 && !loading && (
                            <TableRow>
                                <TableCell colSpan={6} sx={{ py: 6, textAlign: 'center', color: 'text.disabled' }}>
                                    No pipeline executions recorded yet. Click <strong>Refresh Now</strong> to start one.
                                </TableCell>
                            </TableRow>
                        )}

                        {executions.map((exec) => {
                            const shortId = exec.ExecutionId.split(':').pop() ?? exec.ExecutionId;
                            const isExpanded = expandedRow === exec.ExecutionId;
                            const isRunning = exec.overallStatus === 'RUNNING';

                            // Compute pipeline-level start/end from step data
                            const allStarts = exec.steps.filter(s => s.start_time).map(s => s.start_time!);
                            const allEnds = exec.steps.filter(s => s.end_time).map(s => s.end_time!);
                            const pipelineStart = allStarts.length > 0 ? allStarts.sort()[0] : undefined;
                            const pipelineEnd = !isRunning && allEnds.length > 0 ? allEnds.sort().pop() : undefined;

                            return (
                                <React.Fragment key={exec.ExecutionId}>
                                    {/* ─── Summary Row ─── */}
                                    <TableRow
                                        onClick={() => toggleExpand(exec.ExecutionId)}
                                        sx={{
                                            cursor: 'pointer',
                                            '&:hover': { bgcolor: '#faf8f2' },
                                            ...(isExpanded && { bgcolor: '#faf8f2' }),
                                            ...(isRunning && {
                                                borderLeft: '3px solid',
                                                borderColor: 'primary.light'
                                            })
                                        }}
                                    >
                                        <TableCell sx={{ px: 1 }}>
                                            {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem' }}>
                                                {shortId}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>{statusChip(exec.overallStatus)}</TableCell>
                                        <TableCell>
                                            <Typography variant="body2">{formatTime(pipelineStart)}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                {isRunning ? 'In Progress' : formatDuration(pipelineStart, pipelineEnd)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', gap: 1 }}>
                                                {isRunning && (
                                                    <Tooltip title="Stop Execution">
                                                        <IconButton size="small" color="error" onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleStop(exec.ExecutionId);
                                                        }}>
                                                            <StopIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {!isRunning && (
                                                    <Tooltip title="Delete Record">
                                                        <IconButton size="small" color="default" onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(exec.ExecutionId);
                                                        }}>
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </Box>
                                        </TableCell>
                                    </TableRow>

                                    {/* ─── Expanded Step Detail ─── */}
                                    <TableRow>
                                        <TableCell colSpan={6} sx={{ p: 0, border: 'none' }}>
                                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                                <Fade in={isExpanded}>
                                                    <Box sx={{ px: 4, py: 2, bgcolor: '#fdfbf7' }}>
                                                        <Table size="small">
                                                            <TableHead>
                                                                <TableRow>
                                                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary', width: 30 }}></TableCell>
                                                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary' }}>Step Name</TableCell>
                                                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary' }}>Started At</TableCell>
                                                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary' }}>Completed At</TableCell>
                                                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary' }}>Duration</TableCell>
                                                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: 'text.secondary' }}>Message</TableCell>
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {PIPELINE_STEPS.map((stepKey) => {
                                                                    const step = getStepData(exec, stepKey);
                                                                    const isActive = step.status === 'IN_PROGRESS';
                                                                    return (
                                                                        <TableRow key={stepKey} sx={{
                                                                            ...(isActive && {
                                                                                bgcolor: '#FFF8E1',
                                                                                '& td': { fontWeight: 600 }
                                                                            })
                                                                        }}>
                                                                            <TableCell sx={{ py: 1 }}>
                                                                                {stepIcon(step.status)}
                                                                            </TableCell>
                                                                            <TableCell sx={{ py: 1, fontWeight: isActive ? 700 : 400 }}>
                                                                                {STEP_LABELS[stepKey] ?? stepKey}
                                                                            </TableCell>
                                                                            <TableCell sx={{ py: 1, fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                                                                {formatTime(step.start_time)}
                                                                            </TableCell>
                                                                            <TableCell sx={{ py: 1, fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                                                                {formatTime(step.end_time)}
                                                                            </TableCell>
                                                                            <TableCell sx={{ py: 1, fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                                                                {formatDuration(step.start_time, step.end_time)}
                                                                            </TableCell>
                                                                            <TableCell sx={{
                                                                                py: 1, fontSize: '0.8rem',
                                                                                maxWidth: 300,
                                                                                overflow: 'hidden',
                                                                                textOverflow: 'ellipsis',
                                                                                whiteSpace: 'nowrap',
                                                                                color: step.status === 'ERROR' ? 'error.main' : isActive ? 'primary.main' : 'text.secondary'
                                                                            }}>
                                                                                {step.message ?? (step.status === 'PENDING' ? '' : '--')}
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    );
                                                                })}
                                                            </TableBody>
                                                        </Table>
                                                    </Box>
                                                </Fade>
                                            </Collapse>
                                        </TableCell>
                                    </TableRow>
                                </React.Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

        </Container>
    );
};

export default DataRefreshPage;
