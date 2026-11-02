import { Spinner } from '../spinner/Spinner'

type LoadingStateProps = {
  /** What's loading, as a sentence that ends in an ellipsis: "Loading usage…". */
  label: string
}

/**
 * A page's first load: the spinner over a line saying what's coming, centred
 * in the content area. A status region, so the line is announced.
 */
export function LoadingState({ label }: LoadingStateProps): JSX.Element {
  return (
    <div className="page-empty" role="status">
      <Spinner />
      <p className="type-body-default text-tertiary">{label}</p>
    </div>
  )
}
