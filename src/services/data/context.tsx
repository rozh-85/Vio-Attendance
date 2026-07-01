import { createContext, useContext, type ReactNode } from 'react';
import type { DataService } from './DataService';
import { dataService as defaultService } from './index';

const DataServiceContext = createContext<DataService>(defaultService);

/**
 * Provides the active DataService to the tree. In production this is the
 * configured singleton; tests can inject a fake implementation.
 */
export function DataServiceProvider({
  service = defaultService,
  children,
}: {
  service?: DataService;
  children: ReactNode;
}) {
  return (
    <DataServiceContext.Provider value={service}>
      {children}
    </DataServiceContext.Provider>
  );
}

export function useDataService(): DataService {
  return useContext(DataServiceContext);
}
