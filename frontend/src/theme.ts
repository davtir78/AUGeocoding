import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        primary: {
            main: '#8D7435', // Antique Gold (Darker for contrast)
            light: '#C8A74C', // Original Gold
            dark: '#5F4D20',
            contrastText: '#ffffff',
        },
        secondary: {
            main: '#2A6E67', // Deep Verdigris
            light: '#438E86',
            dark: '#17403B',
            contrastText: '#ffffff',
        },
        background: {
            default: '#f8f7f6', // Background Light
            paper: '#fdfbf7',   // Parchment
        },
        text: {
            primary: '#2c2c2c', // Ink
            secondary: '#5d5d5d',
        },
        // Custom palette extensions would go here if using TypeScript module augmentation
    },
    typography: {
        fontFamily: [
            'Inter',
            'system-ui',
            'sans-serif',
        ].join(','),
        h1: { fontFamily: '"Playfair Display", serif', fontWeight: 700 },
        h2: { fontFamily: '"Playfair Display", serif', fontWeight: 700 },
        h3: { fontFamily: '"Playfair Display", serif', fontWeight: 700 },
        h4: { fontFamily: '"Playfair Display", serif', fontWeight: 700 },
        h5: { fontFamily: '"Playfair Display", serif', fontWeight: 600 },
        h6: { fontFamily: '"Playfair Display", serif', fontWeight: 600 },
    },
    shape: {
        borderRadius: 8,
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 8,
                },
                containedPrimary: {
                    color: '#ffffff', // White text on gold button for better contrast
                }
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none', // Reset default MUI elevation overlay
                }
            }
        }
    },
});

export default theme;
