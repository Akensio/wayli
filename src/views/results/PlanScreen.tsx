// The plan screen inside the sheet: the peek line, an error if planning failed, the results, the recent trips.
import * as results from '../../state/results';
import { PeekLine } from './PeekLine';
import { Results } from './Results';
import { Recent } from './Recent';

export function PlanScreen() {
  return (
    <>
      <PeekLine />
      <div class="error-box" id="planError" hidden={!results.error.value}>
        {results.error.value}
      </div>
      <Results />
      <Recent />
    </>
  );
}
