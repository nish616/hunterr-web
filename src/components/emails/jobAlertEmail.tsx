import { Job } from "@/types/job";
import { styles } from "./styles";

function JobCard({ job }: { job: Job }) {
  return (
    <div style={styles.jobCard}>
      <h2>{job.title}</h2>

      <p>{job.company}</p>

      <p>{job.location}</p>

      <p>
        Posted{" "}
        {new Date(job.postedAt).toLocaleDateString()}
      </p>

      <a href={job.url} style={styles.button}>
        Apply Now →
      </a>
    </div>
  );
}

export function JobAlertEmail({ jobs }: { jobs: Job[] }) {


  return (
    <div>
      <h1>Jobs</h1>

      {jobs.map((job) => (
        <JobCard job={job} />
      ))}
    </div>
  );
}
