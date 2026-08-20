import { fireEvent, render, screen } from '@testing-library/react';
import RoutesListContent from '@/app/components/RoutesListContent';
import type { Route } from '@/amplify/types';

const classes = {
  badge: 'badge',
  badgePlanned: 'badgePlanned',
  badgeActive: 'badgeActive',
  badgeCompleted: 'badgeCompleted',
  badgeArchived: 'badgeArchived',
  cellLabel: 'cellLabel',
  cellRight: 'cellRight',
  cellValue: 'cellValue',
  cellValueMono: 'cellValueMono',
  cellValueMonoNormal: 'cellValueMonoNormal',
  deleteBtn: 'deleteBtn',
  editLink: 'editLink',
  emptyState: 'emptyState',
  emptyStateText: 'emptyStateText',
  errorBanner: 'errorBanner',
  filterBtn: 'filterBtn',
  filterBtnActive: 'filterBtnActive',
  filterLabel: 'filterLabel',
  filterRow: 'filterRow',
  notesPreview: 'notesPreview',
  routeRow: 'routeRow',
  routesList: 'routesList',
  viewLink: 'viewLink',
};

function makeRoute(overrides: Partial<Route>): Route {
  return {
    id: overrides.id ?? 'route-1',
    routeCode: overrides.routeCode ?? 'W19-26-001',
    customerId: overrides.customerId ?? 'customer-1',
    status: overrides.status ?? 'planned',
    createdAt: overrides.createdAt ?? '2024-01-15T10:00:00Z',
    actualDurationMinutes: overrides.actualDurationMinutes,
    notes: overrides.notes,
  } as Route;
}

function renderSubject(props: Partial<React.ComponentProps<typeof RoutesListContent>> = {}) {
  const onDeleteRoute = jest.fn();
  const onStatusFilterChange = jest.fn();

  render(
    <RoutesListContent
      canDeleteRoutes={true}
      classes={classes}
      customersById={{ 'customer-1': 'Acme Corp' }}
      deletingRouteId={null}
      error={null}
      filteredRoutes={[makeRoute({ id: 'route-1' })]}
      getDetailHref={(route) => `/routes/detail?id=${route.id}`}
      getEditHref={(route) => `/routes/edit?id=${route.id}`}
      loading={false}
      onDeleteRoute={onDeleteRoute}
      onStatusFilterChange={onStatusFilterChange}
      showEditLink={true}
      statusFilter="all"
      {...props}
    />
  );

  return { onDeleteRoute, onStatusFilterChange };
}

describe('RoutesListContent', () => {
  it('shows loading state', () => {
    renderSubject({ loading: true });
    expect(screen.getByText(/loading routes/i)).toBeInTheDocument();
  });

  it('shows error state', () => {
    renderSubject({ error: 'Failed to load routes.' });
    expect(screen.getByText('Failed to load routes.')).toBeInTheDocument();
  });

  it('renders links from route callbacks and hides edit link when disabled', () => {
    const route = makeRoute({ id: 'route-55' });

    renderSubject({
      filteredRoutes: [route],
      showEditLink: false,
      getDetailHref: (value) => `/operator/routes/detail?id=${value.id}`,
    });

    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/operator/routes/detail?id=route-55');
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('shows fallback customer text when customer mapping is missing', () => {
    const route = makeRoute({ id: 'route-77', customerId: 'customer-missing' });

    renderSubject({
      filteredRoutes: [route],
      customersById: {},
    });

    expect(screen.getByText('Unknown customer')).toBeInTheDocument();
  });

  it('truncates long notes with ellipsis and leaves short notes unchanged', () => {
    const longNote = 'A'.repeat(65);
    const shortNote = 'Short note';

    renderSubject({
      filteredRoutes: [
        makeRoute({ id: 'route-long', notes: longNote }),
        makeRoute({ id: 'route-short', notes: shortNote }),
      ],
    });

    expect(screen.getByText(`${'A'.repeat(60)}…`)).toBeInTheDocument();
    expect(screen.getByText(shortNote)).toBeInTheDocument();
  });

  it('does not render note preview block when notes are empty or missing', () => {
    renderSubject({
      filteredRoutes: [
        makeRoute({ id: 'route-empty-notes', notes: '' }),
        makeRoute({ id: 'route-no-notes', notes: undefined }),
      ],
    });

    expect(document.querySelectorAll('.notesPreview')).toHaveLength(0);
  });

  it('emits status filter callback on click', () => {
    const { onStatusFilterChange } = renderSubject();

    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));

    expect(onStatusFilterChange).toHaveBeenCalledWith('completed');
  });

  it('applies active class to selected status filter button', () => {
    renderSubject({ statusFilter: 'completed' });

    expect(screen.getByRole('button', { name: 'Completed' })).toHaveClass('filterBtnActive');
    expect(screen.getByRole('button', { name: 'Planned' })).not.toHaveClass('filterBtnActive');
  });

  it('calls delete callback and shows deleting state when selected route is deleting', () => {
    const route = makeRoute({ id: 'route-99' });
    const { onDeleteRoute } = renderSubject({
      filteredRoutes: [route],
      deletingRouteId: 'route-99',
    });

    fireEvent.click(screen.getByRole('button', { name: /more actions for route w19-26-001/i }));
    const deleteButton = screen.getByRole('button', { name: 'Deleting...' });
    expect(deleteButton).toBeDisabled();

    fireEvent.click(deleteButton);
    expect(onDeleteRoute).not.toHaveBeenCalled();
  });

  it('keeps delete route inside a row actions menu while view and edit stay visible', () => {
    const route = makeRoute({ id: 'route-100' });
    const { onDeleteRoute } = renderSubject({
      filteredRoutes: [route],
      deletingRouteId: null,
    });

    expect(screen.getByRole('link', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /more actions for route w19-26-001/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDeleteRoute).toHaveBeenCalledWith(route);
  });

  it('hides delete action when canDeleteRoutes is false', () => {
    renderSubject({
      canDeleteRoutes: false,
      filteredRoutes: [makeRoute({ id: 'route-no-delete' })],
    });

    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deleting...' })).not.toBeInTheDocument();
  });
});
