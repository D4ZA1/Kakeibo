import m0001 from './0001_init.sql';
import m0002 from './0002_seed_categories.sql';
import m0003 from './0003_saved_payees.sql';

/** Applied in order; PRAGMA user_version records how many have run. Append only, never edit. */
export const MIGRATIONS = [m0001, m0002, m0003];
