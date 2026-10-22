type EventIconProps = {
  eventId: string;
  label?: string;
  className?: string;
};

export function EventIcon({ eventId, label, className = "" }: EventIconProps) {
  return (
    <span
      className={`event-icon ${className}`.trim()}
      role="img"
      aria-label={label ?? eventId}
      title={label ?? eventId}
    >
      <span className={`cubing-icon event-${eventId}`} aria-hidden="true" />
    </span>
  );
}
