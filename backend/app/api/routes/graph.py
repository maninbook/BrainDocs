from fastapi import APIRouter, Depends, Query
from app.repositories.neo4j_repo import Neo4jRepository

router = APIRouter(prefix="/workspaces/{workspace_id}/graph", tags=["graph"])

def get_neo4j():
    return Neo4jRepository()

@router.get("")
async def get_graph(
    workspace_id: str,
    min_strength: float = Query(0.0, ge=0.0, le=1.0),
    neo4j: Neo4jRepository = Depends(get_neo4j),
):
    data = await neo4j.get_graph(workspace_id, min_strength)
    return {"success": True, "data": data}

@router.get("/local/{paper_id}")
async def get_local_graph(
    workspace_id: str,
    paper_id: str,
    depth: int = Query(2, ge=1, le=3),
    neo4j: Neo4jRepository = Depends(get_neo4j),
):
    from app.core.neo4j import get_neo4j_driver
    from datetime import datetime

    EDGE_COLORS = {
        "citation": "#5BC8F5",
        "concept_share": "#4ECCA3",
        "methodology": "#A855F7",
        "contradiction": "#FF6B6B",
    }

    driver = get_neo4j_driver()
    async with driver.session() as session:
        result = await session.run(
            f"""
            MATCH path = (center:Paper {{id: $paper_id}})-[:CONNECTED*1..{depth}]-(neighbor:Paper {{workspace_id: $ws}})
            WITH nodes(path) as ns, relationships(path) as rs
            UNWIND ns as n
            WITH collect(DISTINCT n) as all_nodes, rs
            UNWIND rs as r
            RETURN all_nodes, collect(DISTINCT r) as all_rels
            """,
            paper_id=paper_id, ws=workspace_id,
        )
        record = await result.single()
        if not record:
            return {"success": True, "data": {"nodes": [], "edges": [], "clusters": [], "meta": {}}}

        raw_nodes = record["all_nodes"]
        raw_edges = record["all_rels"]

    nodes = [
        {
            "id": n["id"],
            "type": "paper",
            "label": n.get("title") or "제목 없음",
            "x": hash(n["id"]) % 500 / 5.0,
            "y": hash(n["id"] + "y") % 500 / 5.0,
            "size": 10,
            "color": "#F5C842" if n.get("is_key_paper") else "#4A7FA5",
            "attributes": {
                "year": n.get("year"),
                "authors": list(n.get("authors") or []),
                "isKeyPaper": n.get("is_key_paper", False),
            },
        }
        for n in raw_nodes
    ]

    edges = [
        {
            "id": str(e.element_id),
            "source": e.nodes[0]["id"],
            "target": e.nodes[1]["id"],
            "size": max(0.5, (e.get("strength") or 0) * 4),
            "color": EDGE_COLORS.get(e.get("relation_type", ""), "#4A7FA5"),
            "attributes": {
                "strength": e.get("strength") or 0,
                "relationType": e.get("relation_type", "concept_share"),
                "sharedConcepts": list(e.get("shared_concepts") or []),
                "reinforcementCount": e.get("reinforcement_count") or 0,
            },
        }
        for e in raw_edges
    ]

    return {"success": True, "data": {
        "nodes": nodes,
        "edges": edges,
        "clusters": [],
        "meta": {"totalNodes": len(nodes), "totalEdges": len(edges), "lastUpdated": datetime.utcnow().isoformat()},
    }}

@router.post("/edges", status_code=201)
async def create_edge(
    workspace_id: str,
    payload: dict,
    neo4j: Neo4jRepository = Depends(get_neo4j),
):
    new_strength = await neo4j.reinforce_edge(
        payload["sourcePaperId"],
        payload["targetPaperId"],
        0.20,  # 수동 링크 +0.20
    )
    return {"success": True, "data": {"strength": new_strength}}
