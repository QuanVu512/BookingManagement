// Compatibility shim: the Courts feature owns the API client and item guard.
export {
  loadCourtCatalog,
  loadCourtDetail,
} from '../features/courts/api/court-api';
export { isCourtItem } from '../features/courts/model/court';
