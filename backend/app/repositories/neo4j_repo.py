from datetime import datetime, timedelta
import math
import structlog
from app.core.neo4j import get_neo4j_driver
from app.core.config import settings

log = structlog.get_logger()

class Neo4jRepository:

    async def create_paper_node(self, paper) -> None:
        driver = get_neo4j_driver()
        async with driver.session() as session:
            await session.run(
                """
                MERGE (p:Paper {id: $id})
                SET p.title = $title,
                    p.year = $year,
                    p.workspace_id = $workspace_id,
                    p.is_key_paper = $is_key_paper,
                    p.authors = $authors,
                    p.keywords = $keywords,
                    p.updated_at = $updated_at
                """,
                id=str(paper.id),
                title=paper.title or "",
                year=paper.year or 0,
                workspace_id=str(paper.workspace_id),
                is_key_paper=paper.is_key_paper,
                authors=paper.authors or [],
                keywords=paper.keywords or [],
                updated_at=datetime.utcnow().isoformat(),
            )

    async def compute_and_store_edges(self, paper, top_k: int = 10) -> None:
        """새 논문과 기존 논문들 간의 유사도 엣지 생성"""
        driver = get_neo4j_driver()
        async with driver.session() as session:
            # 같은 워크스페이스의 다른 논문들 가져오기
            result = await session.run(
                """
                MATCH (p:Paper {workspace_id: $workspace_id})
                WHERE p.id <> $paper_id
                RETURN p.id as id, p.keywords as keywords, p.title as title
                LIMIT 100
                """,
                workspace_id=str(paper.workspace_id),
                paper_id=str(paper.id),
            )
            existing_papers = await result.data()

            # 키워드 기반 간단한 유사도 계산 (실제로는 벡터 기반으로 교체)
            paper_keywords = set(paper.keywords or [])
            edges_to_create = []

            for ep in existing_papers:
                other_keywords = set(ep.get("keywords") or [])
                if not paper_keywords or not other_keywords:
                    continue
                # Jaccard 유사도
                intersection = len(paper_keywords & other_keywords)
                union = len(paper_keywords | other_keywords)
                similarity = intersection / union if union > 0 else 0.0

                if similarity > 0.05:
                    shared = list(paper_keywords & other_keywords)
                    edges_to_create.append({
                        "target_id": ep["id"],
                        "strength": min(similarity * 2, 1.0),
                        "shared_concepts": shared,
                    })

            # 상위 top_k만 생성
            edges_to_create.sort(key=lambda x: x["strength"], reverse=True)
            for edge in edges_to_create[:top_k]:
                await session.run(
                    """
                    MATCH (a:Paper {id: $source_id}), (b:Paper {id: $target_id})
                    MERGE (a)-[r:CONNECTED]-(b)
                    SET r.strength = $strength,
                        r.relation_type = 'concept_share',
                        r.shared_concepts = $shared_concepts,
                        r.reinforcement_count = COALESCE(r.reinforcement_count, 0),
                        r.last_reinforced = $now
                    """,
                    source_id=str(paper.id),
                    target_id=edge["target_id"],
                    strength=edge["strength"],
                    shared_concepts=edge["shared_concepts"],
                    now=datetime.utcnow().isoformat(),
                )

    async def get_graph(
        self,
        workspace_id: str,
        min_strength: float = 0.0,
    ) -> dict:
        driver = get_neo4j_driver()
        async with driver.session() as session:
            nodes_result = await session.run(
                """
                MATCH (p:Paper {workspace_id: $workspace_id})
                RETURN p.id as id, p.title as title, p.year as year,
                       p.authors as authors, p.is_key_paper as is_key_paper,
                       p.community_id as community_id
                """,
                workspace_id=workspace_id,
            )
            nodes_data = await nodes_result.data()

            edges_result = await session.run(
                """
                MATCH (a:Paper {workspace_id: $workspace_id})-[r:CONNECTED]-(b:Paper {workspace_id: $workspace_id})
                WHERE r.strength >= $min_strength AND id(a) < id(b)
                RETURN elementId(r) as id,
                       a.id as source, b.id as target,
                       r.strength as strength,
                       r.relation_type as relation_type,
                       r.shared_concepts as shared_concepts,
                       r.reinforcement_count as reinforcement_count
                """,
                workspace_id=workspace_id,
                min_strength=min_strength,
            )
            edges_data = await edges_result.data()

        # 노드 → 연결 수 집계
        conn_count: dict[str, int] = {}
        for e in edges_data:
            conn_count[e["source"]] = conn_count.get(e["source"], 0) + 1
            conn_count[e["target"]] = conn_count.get(e["target"], 0) + 1

        EDGE_COLORS = {
            "citation": "#5BC8F5",
            "concept_share": "#4ECCA3",
            "methodology": "#A855F7",
            "contradiction": "#FF6B6B",
        }

        nodes = [
            {
                "id": n["id"],
                "type": "paper",
                "label": n["title"] or "제목 없음",
                "x": hash(n["id"]) % 500 / 5.0,  # 임시 좌표 (FA2 레이아웃에서 재계산)
                "y": hash(n["id"] + "y") % 500 / 5.0,
                "size": 8 + min(conn_count.get(n["id"], 0) * 1.5, 20),
                "color": "#F5C842" if n["is_key_paper"] else "#4A7FA5",
                "attributes": {
                    "year": n["year"],
                    "authors": n["authors"] or [],
                    "isKeyPaper": n["is_key_paper"],
                    "clusterId": n.get("community_id"),
                    "connectionCount": conn_count.get(n["id"], 0),
                },
            }
            for n in nodes_data
        ]

        edges = [
            {
                "id": e["id"],
                "source": e["source"],
                "target": e["target"],
                "size": max(0.5, (e["strength"] or 0) * 4),
                "color": EDGE_COLORS.get(e.get("relation_type", ""), "#4A7FA5"),
                "attributes": {
                    "strength": e["strength"] or 0,
                    "relationType": e.get("relation_type", "concept_share"),
                    "sharedConcepts": e.get("shared_concepts") or [],
                    "reinforcementCount": e.get("reinforcement_count") or 0,
                },
            }
            for e in edges_data
        ]

        return {"nodes": nodes, "edges": edges, "clusters": [], "meta": {
            "totalNodes": len(nodes),
            "totalEdges": len(edges),
            "lastUpdated": datetime.utcnow().isoformat(),
        }}

    async def reinforce_edge(self, paper_id_a: str, paper_id_b: str, delta: float) -> float:
        """시냅스 강화"""
        driver = get_neo4j_driver()
        async with driver.session() as session:
            result = await session.run(
                """
                MATCH (a:Paper {id: $id_a}), (b:Paper {id: $id_b})
                MERGE (a)-[r:CONNECTED]-(b)
                SET r.strength = COALESCE(r.strength, 0.1) + $delta,
                    r.reinforcement_count = COALESCE(r.reinforcement_count, 0) + 1,
                    r.last_reinforced = $now
                RETURN r.strength as new_strength
                """,
                id_a=paper_id_a,
                id_b=paper_id_b,
                delta=delta,
                now=datetime.utcnow().isoformat(),
            )
            record = await result.single()
            return min(record["new_strength"], 1.0) if record else 0.0

    async def get_connection_counts(self, workspace_id: str, paper_ids: list[str]) -> dict[str, int]:
        """논문 ID 목록에 대한 연결 수 일괄 조회"""
        if not paper_ids:
            return {}
        driver = get_neo4j_driver()
        async with driver.session() as session:
            result = await session.run(
                """
                MATCH (p:Paper {workspace_id: $workspace_id})-[r:CONNECTED]-()
                WHERE p.id IN $paper_ids
                RETURN p.id as id, count(r) as conn_count
                """,
                workspace_id=workspace_id,
                paper_ids=paper_ids,
            )
            data = await result.data()
            return {row["id"]: row["conn_count"] for row in data}

    async def apply_decay(self, workspace_id: str) -> int:
        """시냅스 감쇠 (매일 실행)"""
        lam = settings.SYNAPSE_DECAY_LAMBDA
        min_s = settings.SYNAPSE_MIN_STRENGTH
        driver = get_neo4j_driver()
        async with driver.session() as session:
            result = await session.run(
                """
                MATCH (a:Paper {workspace_id: $ws})-[r:CONNECTED]-(b:Paper {workspace_id: $ws})
                WHERE r.last_reinforced IS NOT NULL
                WITH r,
                     duration.inDays(datetime(r.last_reinforced), datetime()).days as days_since
                SET r.strength = CASE
                    WHEN r.strength * exp(-$decay_rate * days_since) < $min_s THEN $min_s
                    ELSE r.strength * exp(-$decay_rate * days_since)
                END
                RETURN count(r) as updated_count
                """,
                ws=workspace_id,
                decay_rate=lam,
                min_s=min_s,
            )
            record = await result.single()
            return record["updated_count"] if record else 0
