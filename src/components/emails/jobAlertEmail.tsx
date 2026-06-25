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
  const today = new Date();

  const formattedDate = [
    String(today.getDate()).padStart(2, "0"),
    String(today.getMonth() + 1).padStart(2, "0"),
    today.getFullYear(),
  ].join("-");

  return (
    <div>
      <h1>Job Alerts {formattedDate}</h1>

      {jobs.map((job) => (
        <JobCard job={job} />
      ))}
    </div>
  );
}
