'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  AppBar,
  Box,
  Container,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  ThemeProvider,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import DashboardIcon from '@mui/icons-material/Dashboard';
import MapIcon from '@mui/icons-material/Map';
import LogoutIcon from '@mui/icons-material/Logout';
import { operatorTheme } from '@/app/operator/mui-theme';
import ThemeModeSelect from '@/app/components/ThemeModeSelect';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/operator/dashboard', icon: <DashboardIcon /> },
  { label: 'Routes', href: '/operator/routes', icon: <MapIcon /> },
];

const DRAWER_WIDTH = 280;
const APP_BAR_HEIGHT = 68;

interface OperatorMUILayoutProps {
  children: React.ReactNode;
  userEmail: string;
  onLogout: () => void;
}

/**
 * Operator Portal Layout using Material UI
 * Mobile-first design with AppBar and Drawer navigation
 * Applies NullDevice dark theme colors to MUI components
 */
export default function OperatorMUILayout({
  children,
  userEmail,
  onLogout,
}: OperatorMUILayoutProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  const handleLogout = () => {
    setLogoutDialogOpen(false);
    onLogout();
  };

  const handleNavClick = () => {
    setDrawerOpen(false);
  };

  const drawerContent = (
    <Box
      sx={{
        width: DRAWER_WIDTH,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        pt: 2,
        pb: 2,
        px: 2,
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
    >
      {/* Brand */}
      <Box sx={{ mb: 3, pb: 2, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <Typography
          sx={{
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: '#ffb300',
            fontFamily: 'var(--nd-font-mono, monospace)',
            fontSize: '0.9rem',
            mb: 0.5,
          }}
        >
          NullDevice
        </Typography>
        <Typography
          sx={{
            fontFamily: 'var(--nd-font-mono, monospace)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(255, 255, 255, 0.38)',
            fontSize: '0.65rem',
            display: 'block',
          }}
        >
          Operator Portal
        </Typography>
      </Box>

      {/* Navigation - grows to fill space */}
      <List
        sx={{
          flex: 1,
          mb: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = pathname && (pathname === item.href || pathname.startsWith(item.href + '/'));
          return (
            <ListItem key={item.href} disablePadding>
              <ListItemButton
                component={Link}
                href={item.href}
                onClick={handleNavClick}
                selected={Boolean(isActive)}
                sx={{
                  borderRadius: 1,
                  color: isActive ? '#ffb300' : 'rgba(255, 255, 255, 0.6)',
                  '&.Mui-selected': {
                    backgroundColor: 'rgba(255, 179, 0, 0.08)',
                    color: '#ffb300',
                  },
                }}
              >
                <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography
                      sx={{
                        fontSize: '0.9rem',
                        fontFamily: 'var(--nd-font-mono, monospace)',
                        fontWeight: 500,
                        color: 'inherit',
                      }}
                    >
                      {item.label}
                    </Typography>
                  }
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider sx={{ my: 2, borderColor: 'rgba(255, 255, 255, 0.08)' }} />

      {/* User Section - anchored to bottom */}
      <Box sx={{ mt: 'auto' }}>
        <Box sx={{ mb: 2 }}>
          <ThemeModeSelect />
        </Box>

        <Typography
          sx={{
            fontFamily: 'var(--nd-font-mono, monospace)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'rgba(255, 255, 255, 0.38)',
            fontSize: '0.65rem',
            display: 'block',
            mt: 2,
            mb: 0.5,
          }}
        >
          Signed in as
        </Typography>
        <Typography
          sx={{
            color: 'rgba(255, 255, 255, 0.6)',
            fontFamily: 'var(--nd-font-mono, monospace)',
            fontSize: '0.75rem',
            wordBreak: 'break-all',
            mb: 2,
          }}
        >
          {userEmail}
        </Typography>

        {/* Logout Button */}
        <Button
          fullWidth
          variant="outlined"
          startIcon={<LogoutIcon />}
          onClick={() => setLogoutDialogOpen(true)}
          sx={{
            borderColor: 'rgba(255, 255, 255, 0.15)',
            color: 'rgba(255, 255, 255, 0.6)',
            fontSize: '0.75rem',
            py: 1,
            '&:hover': {
              borderColor: '#ff4757',
              color: '#ff4757',
            },
          }}
        >
          Logout
        </Button>
      </Box>
    </Box>
  );

  return (
    <ThemeProvider theme={operatorTheme}>
      <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0a0a0a' }}>
        {/* AppBar */}
        <AppBar
          position="fixed"
          sx={{
            zIndex: (theme) => theme.zIndex.drawer + 1,
            width: '100%',
            ml: 0,
          }}
        >
          <Toolbar sx={{ minHeight: `${APP_BAR_HEIGHT}px !important`, py: 1 }}>
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setDrawerOpen(!drawerOpen)}
              sx={{ mr: 2 }}
            >
              {drawerOpen ? <CloseIcon /> : <MenuIcon />}
            </IconButton>
            <div>
              <Typography
                sx={{
                  flexGrow: 1,
                  fontFamily: 'var(--nd-font-mono, monospace)',
                  fontSize: '1.75rem',
                  fontWeight: 500,
                  letterSpacing: '0.015em',
                  color: 'var(--nd-primary-accent)',
                }}
              >
                Operator Portal
              </Typography>
              <Typography
                sx={{
                  flexGrow: 1,
                  fontFamily: 'var(--nd-font-mono, monospace)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  letterSpacing: '0.015em',
                }}
              >
                Welcome: {userEmail}
              </Typography>
          </div>
          </Toolbar>
        </AppBar>

        {/* Floating Drawer (all breakpoints) */}
        <Drawer
          anchor="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          variant="temporary"
          sx={{
            display: 'block',
            zIndex: (theme) => theme.zIndex.drawer,
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              backgroundColor: '#111111',
              top: `${APP_BAR_HEIGHT}px`,
              height: `calc(100vh - ${APP_BAR_HEIGHT}px)`,
            },
          }}
        >
          {drawerContent}
        </Drawer>

        {/* Main Content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            width: '100%',
            mt: `${APP_BAR_HEIGHT}px`,
            pb: 2,
            px: { xs: 2, sm: 2, md: 3 },
            pt: 2,
            backgroundColor: '#0a0a0a',
            boxSizing: 'border-box',
            marginLeft: 0,
            overflowY: 'auto',
            height: `calc(100vh - ${APP_BAR_HEIGHT}px)`,
          }}
        >
          <Container
            maxWidth="lg"
            sx={{
              py: { xs: 1, sm: 2, md: 2 },
              px: { xs: 0, sm: 1, md: 2 },
            }}
          >
            {children}
          </Container>
        </Box>

        {/* Logout Confirmation Dialog */}
        <Dialog open={logoutDialogOpen} onClose={() => setLogoutDialogOpen(false)}>
          <DialogTitle>Logout</DialogTitle>
          <DialogContent>
            <DialogContentText>Are you sure you want to logout?</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setLogoutDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleLogout} color="error" variant="contained">
              Logout
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}
