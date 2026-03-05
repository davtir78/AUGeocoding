import React from 'react';
import {
    Box,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    CssBaseline,
    useTheme,
    useMediaQuery,
    Typography,
    Divider,
    AppBar,
    Toolbar,
    IconButton,
    Avatar,
    Tooltip
} from '@mui/material';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { Link, useLocation } from 'react-router-dom';
import MapIcon from '@mui/icons-material/Map';
import BatchPredictionIcon from '@mui/icons-material/BatchPrediction';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsIcon from '@mui/icons-material/Settings';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import PublicIcon from '@mui/icons-material/Public';
import ApiIcon from '@mui/icons-material/Api';

const drawerWidth = 280; // Slightly wider for better readability

// Navigation items type definition
interface NavItem {
    text: string;
    path: string;
    icon: React.ReactNode;
}

// Navigation items definition
const navItems: NavItem[] = [
    { text: 'Overview', path: '/', icon: <DashboardIcon /> },
    { text: 'Single Search', path: '/search', icon: <MapIcon /> },
    { text: 'Batch Geocoding', path: '/batch', icon: <BatchPredictionIcon /> },
    { text: 'Data Governance', path: '/refresh', icon: <SettingsIcon /> },
    { text: 'API Documentation', path: '/apis', icon: <ApiIcon /> },
];

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const theme = useTheme();
    const location = useLocation();
    const isPermanentDrawer = useMediaQuery(theme.breakpoints.up('md'));

    const { signOut } = useAuthenticator((context) => [context.signOut]);

    const handleSignOut = () => {
        signOut();
    };



    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: theme.palette.background.default }}>
            <CssBaseline />

            {/* Stitch Header */}
            <AppBar
                position="fixed"
                elevation={0}
                sx={{
                    zIndex: (theme) => theme.zIndex.drawer + 1,
                    backgroundColor: '#fdfbf7',
                    borderBottom: `1px solid ${theme.palette.primary.main}40`,
                    color: theme.palette.text.primary
                }}
            >
                <Toolbar sx={{ justifyContent: 'space-between', minHeight: 64 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {/* Unified Brand Area */}
                        <Box sx={{
                            width: 36,
                            height: 36,
                            bgcolor: 'primary.main',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                            transition: 'transform 0.2s',
                            '&:hover': { transform: 'scale(1.05)' }
                        }}>
                            <MapIcon sx={{ fontSize: '1.2rem' }} />
                        </Box>
                        <Typography
                            variant="h6"
                            sx={{
                                fontWeight: 800,
                                letterSpacing: '-0.01em',
                                background: (theme) => `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                display: { xs: 'none', sm: 'block' }
                            }}
                        >
                            Australian Geocoding
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Tooltip title="Sign Out">
                            <IconButton onClick={handleSignOut} size="small" sx={{ color: 'text.secondary', '&:hover': { color: 'error.main', bgcolor: 'error.lighter' } }}>
                                <LogoutIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Toolbar>
            </AppBar>

            {/* Restyled Sidebar */}
            <Drawer
                variant={isPermanentDrawer ? "permanent" : "temporary"}
                anchor="left"
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: drawerWidth,
                        boxSizing: 'border-box',
                        bgcolor: 'background.paper',
                        borderRight: '1px solid',
                        borderColor: 'divider',
                    },
                }}
            >
                <Toolbar sx={{ display: 'flex', alignItems: 'center', px: 3 }}>
                    <Box sx={{ color: 'primary.main', mr: 1.5, display: 'flex' }}>
                        <PublicIcon />
                    </Box>
                    <Typography variant="h6" noWrap component="div" fontWeight={800} sx={{ letterSpacing: '-0.02em', color: 'text.primary', fontFamily: '"Playfair Display", serif' }}>
                        G-NAF
                    </Typography>
                </Toolbar>
                <Divider />
                <List sx={{ px: 2, pt: 2 }}>
                    {navItems.map((item) => {
                        const active = location.pathname === item.path;
                        return (
                            <ListItem key={item.text} disablePadding sx={{ mb: 1 }}>
                                <ListItemButton
                                    component={Link}
                                    to={item.path}
                                    selected={active}
                                    sx={{
                                        borderRadius: 2,
                                        '&.Mui-selected': {
                                            bgcolor: 'primary.main',
                                            color: 'primary.contrastText',
                                            '&:hover': {
                                                bgcolor: 'primary.dark',
                                            },
                                            '& .MuiListItemIcon-root': {
                                                color: 'primary.contrastText',
                                            },
                                        },
                                        '&:hover': {
                                            bgcolor: 'action.hover',
                                        }
                                    }}
                                >
                                    <ListItemIcon sx={{ minWidth: 40, color: active ? 'inherit' : 'text.secondary' }}>
                                        {item.icon}
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={item.text}
                                        primaryTypographyProps={{
                                            fontWeight: active ? 700 : 500,
                                            fontSize: '0.95rem'
                                        }}
                                    />
                                </ListItemButton>
                            </ListItem>
                        );
                    })}
                </List>
            </Drawer>

            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    p: 0,
                    width: isPermanentDrawer ? `calc(100% - ${drawerWidth}px)` : '100%',
                    height: '100vh',
                    pt: 8, // Offset for fixed AppBar
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                {children}
            </Box>
        </Box>
    );
};

export default Layout;
