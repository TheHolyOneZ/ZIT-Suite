use std::future::Future;

use tokio::task::JoinSet;

pub const SCAN_CONCURRENCY: usize = 8;

pub async fn bounded<T, R, F, Fut>(inputs: Vec<T>, f: F, mut progress: impl FnMut(u32, u32)) -> Vec<R>
where
    T: Send + 'static,
    R: Send + 'static,
    F: Fn(T) -> Fut,
    Fut: Future<Output = R> + Send + 'static,
{
    let total = inputs.len() as u32;
    let mut out: Vec<Option<R>> = (0..inputs.len()).map(|_| None).collect();
    let mut set = JoinSet::new();
    let mut iter = inputs.into_iter().enumerate();
    let mut done = 0u32;
    loop {
        while set.len() < SCAN_CONCURRENCY {
            let Some((i, t)) = iter.next() else { break };
            let fut = f(t);
            set.spawn(async move { (i, fut.await) });
        }
        match set.join_next().await {
            Some(Ok((i, r))) => {
                out[i] = Some(r);
                done += 1;
                progress(done, total);
            }
            Some(Err(e)) => log::error!("scan task failed: {e}"),
            None => break,
        }
    }
    out.into_iter().flatten().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn keeps_order_and_reports_progress() {
        let mut seen = vec![];
        let out = bounded((0..20u64).collect(), |n| async move {
            tokio::time::sleep(std::time::Duration::from_millis(20 - n)).await;
            n * 2
        }, |d, t| seen.push((d, t)))
        .await;
        assert_eq!(out, (0..20u64).map(|n| n * 2).collect::<Vec<_>>());
        assert_eq!(seen.last(), Some(&(20, 20)));
    }
}
