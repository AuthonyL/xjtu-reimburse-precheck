import { configure } from '@testing-library/dom';

// Hosted CI runners (especially Windows) are slower than local machines; give UI waits more room.
configure({ asyncUtilTimeout: 5000 });
