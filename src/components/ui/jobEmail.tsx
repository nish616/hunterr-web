type Job = {
  title: string;
  company: string;
  location: string;
  postedAt: string;
};

export function JobAlertEmail({ jobs }: { jobs: Job[] }) {
  return (
    <div>
      <h1>New Jobs Found</h1>

      {jobs.map((job) => (
        <div key={`${job.company}-${job.title}`}>
          <h3>{job.title}</h3>
          <p>{job.company}</p>
          <p>{job.location}</p>
        </div>
      ))}
    </div>
  );
}